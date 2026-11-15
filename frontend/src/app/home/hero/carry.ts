/**
 * The Glove's carry: one stack from the press to its snap or drop. While carried, the stack is
 * kinematic and touches nothing (see physics.ts); it flies one brick above whatever is under it
 * (snap.ts), rights itself studs-up, lags slightly behind the pointer and tilts toward its
 * movement. On release it snaps onto the ghost's position and joins that stack, or drops.
 */
import { approach } from './ambient';
import { BrickShape } from './catalog';
import { CARRY } from './config';
import { Physics } from './physics';
import {
  conjugate,
  IDENTITY,
  multiplyQuat,
  nlerpQuat,
  Quat,
  tiltQuat,
  toLocal,
  toWorld,
  uprightness,
  Vec3,
  yawOf,
  yawQuat,
} from './pose';
import type { BlobShadow, PlacedBrick } from './scene';
import { Carried, CarriedPart, carryCenterY, snapTarget, SnapTarget, WorldBrick } from './snap';
import { Stacks } from './stacks';

/** What the carry draws: the carried bricks, the ghost at the snap target, the blob shadow. */
export interface CarryView {
  setCarried(ids: readonly number[]): void;
  setGhost(bricks: readonly PlacedBrick[] | null): void;
  setBlobShadow(blob: BlobShadow | null): void;
}

export interface CarryDeps {
  readonly physics: Physics;
  readonly stacks: Stacks;
  readonly view: CarryView;
  readonly shapeOf: (id: number) => BrickShape | null;
  /**
   * Keeps a footprint (center and radius) inside the play area and out of the keep-outs: the
   * walls don't touch a carried stack, so this is all that holds it in.
   */
  readonly clamp: (x: number, z: number, radius: number) => { x: number; z: number };
  /** No tilt and no bounce with prefers-reduced-motion. */
  readonly reducedMotion: boolean;
}

/** A ray from the camera through the pointer. */
export interface PointerRay {
  readonly origin: Vec3;
  readonly direction: Vec3;
}

const DEG = Math.PI / 180;

/** Share of the snap time spent moving onto the target; the rest is the bounce. */
const SNAP_DESCENT = 0.65;

/**
 * The snap animation at time share `t` (0..1): how far the stack has moved from where it was
 * released to its target (`blend`), and how far above the target it bounces (`lift`, never
 * negative: it never sinks into the brick below).
 */
export function snapProgress(t: number, bounce: boolean, cfg = CARRY): { blend: number; lift: number } {
  const clamped = Math.min(1, Math.max(0, t));
  if (clamped < SNAP_DESCENT) {
    const s = clamped / SNAP_DESCENT;
    return { blend: 1 - (1 - s) ** 3, lift: 0 };
  }
  const s = (clamped - SNAP_DESCENT) / (1 - SNAP_DESCENT);
  return { blend: 1, lift: bounce ? cfg.bounceHeight * Math.sin(Math.PI * s) * (1 - s) : 0 };
}

/** Tilt toward the movement, in radians: grows with speed (studs/s) and is capped. */
export function tiltFor(speed: number, cfg = CARRY): number {
  return cfg.tiltMaxDeg * DEG * Math.min(1, speed / cfg.tiltFullSpeed);
}

interface Snapping {
  readonly target: SnapTarget;
  readonly targetStack: number;
  readonly from: { readonly position: Vec3; readonly rotation: Quat };
  elapsed: number;
  /** The final pose was sent to physics; merge once the body is there. */
  placed: boolean;
}

export class Carry {
  private stack: number | null = null;
  private members: number[] = [];
  private parts: CarriedPart[] = [];
  private grabOffset = { x: 0, z: 0 };
  private ray: PointerRay | null = null;
  private position: Vec3 = { x: 0, y: 0, z: 0 };
  private velocity = { x: 0, z: 0 };
  private startRotation: Quat = IDENTITY;
  /** 0 when picked up, 1 once it is studs-up: eases the righting. */
  private upright = 0;
  private yaw = 0;
  private yawTarget = 0;
  private snap: SnapTarget | null = null;
  private snapping: Snapping | null = null;

  constructor(private readonly deps: CarryDeps) {}

  /** True while a stack is carried or snapping into place. */
  get busy(): boolean {
    return this.stack !== null;
  }

  /** The carried stack's bricks (empty when nothing is carried). */
  get carriedIds(): readonly number[] {
    return this.members;
  }

  get target(): number | null {
    return this.snapping?.target.targetId ?? this.snap?.targetId ?? null;
  }

  /** Picks up the whole stack holding `brick`; `ray` is the pointer at the moment of the press. */
  begin(brick: number, ray: PointerRay): boolean {
    const { physics, stacks } = this.deps;
    const stack = stacks.stackOf(brick);
    const pose = stack === null ? null : physics.stackPose(stack);
    if (stack === null || !pose || this.busy) return false;

    this.stack = stack;
    this.members = stacks.membersOf(stack).map((m) => m.id);
    this.parts = this.members.map((id) => this.partOf(id, pose.position, pose.rotation));
    this.position = { ...pose.position };
    this.velocity = { x: 0, z: 0 };
    this.startRotation = pose.rotation;
    this.upright = uprightness(pose.rotation) > 0.999 ? 1 : 0;
    this.yaw = yawOf(pose.rotation);
    this.yawTarget = this.yaw;
    const grab = this.pointOnPlane(ray, pose.position.y) ?? pose.position;
    this.grabOffset = { x: pose.position.x - grab.x, z: pose.position.z - grab.z };
    this.ray = ray;
    physics.liftStack(stack);
    this.deps.view.setCarried(this.members);
    return true;
  }

  setPointer(ray: PointerRay): void {
    this.ray = ray;
  }

  /** R (a quarter turn) or the mouse wheel (finer steps): turns by `radians`, eased. */
  rotateBy(radians: number): void {
    if (this.stack !== null && !this.snapping) this.yawTarget += radians;
  }

  /** The carried stack's angle about the vertical, in radians (free, not snapped to 90°). */
  get angle(): number {
    return this.yaw;
  }

  /** Release: snap onto the ghost's position, or drop and let physics take over. */
  release(): void {
    const { physics, stacks } = this.deps;
    if (this.stack === null || this.snapping) return;
    const target = this.snap;
    const targetStack = target ? stacks.stackOf(target.targetId) : null;
    const pose = physics.stackPose(this.stack);
    if (target && targetStack !== null && pose) {
      this.snapping = { target, targetStack, from: pose, elapsed: 0, placed: false };
      return;
    }
    physics.dropStack(this.stack);
    this.finish();
  }

  /** Forgets the carry without touching physics (the bricks were removed). */
  reset(): void {
    this.stack = null;
    this.members = [];
    this.snapping = null;
    this.snap = null;
    this.deps.view.setCarried([]);
    this.deps.view.setGhost(null);
    this.deps.view.setBlobShadow(null);
  }

  /** Advances the carry or the snap by `dt` seconds. Call once per frame, before physics steps. */
  update(dt: number): void {
    if (this.stack === null) return;
    if (this.snapping) {
      this.updateSnap(dt, this.snapping);
      return;
    }
    this.updateCarry(dt, this.stack);
  }

  private updateCarry(dt: number, stack: number): void {
    const { physics, view, reducedMotion } = this.deps;
    const pointer = this.ray ? this.pointOnPlane(this.ray, this.position.y) : null;
    const desired = pointer
      ? this.deps.clamp(pointer.x + this.grabOffset.x, pointer.z + this.grabOffset.z, this.radius())
      : { x: this.position.x, z: this.position.z };
    const x = approach(this.position.x, desired.x, CARRY.followRate, dt);
    const z = approach(this.position.z, desired.z, CARRY.followRate, dt);
    if (dt > 0) {
      // Smoothed, so the tilt doesn't flicker with uneven pointer events.
      this.velocity = {
        x: approach(this.velocity.x, (x - this.position.x) / dt, CARRY.followRate, dt),
        z: approach(this.velocity.z, (z - this.position.z) / dt, CARRY.followRate, dt),
      };
    }
    this.yaw = approach(this.yaw, this.yawTarget, CARRY.turnRate, dt);
    this.upright = approach(this.upright, 1, CARRY.heightRate, dt);

    const world = this.worldBricks();
    const carried: Carried = { position: { x, y: this.position.y, z }, yaw: this.yawTarget, parts: this.parts, layers: this.layers() };
    const flyY = carryCenterY({ ...carried, yaw: this.yaw }, world);
    const y = approach(this.position.y, flyY, CARRY.heightRate, dt);
    this.position = { x, y, z };

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const tilt = reducedMotion ? IDENTITY : tiltQuat(this.velocity.z, -this.velocity.x, tiltFor(speed));
    const studsUp = multiplyQuat(tilt, yawQuat(this.yaw));
    physics.carryStack(stack, this.position, nlerpQuat(this.startRotation, studsUp, this.upright));

    this.snap = snapTarget({ ...carried, position: this.position }, world);
    view.setGhost(this.snap ? this.placed(this.snap.position, this.snap.rotation) : null);
    const bottom = this.parts[0];
    const surfaceY = flyY - CARRY.clearance - bottom.height / 2;
    view.setBlobShadow({
      x,
      z,
      surfaceY,
      width: bottom.width,
      depth: bottom.depth,
      yaw: this.yaw,
      height: Math.max(0, y - bottom.height / 2 - surfaceY),
    });
  }

  private updateSnap(dt: number, s: Snapping): void {
    const { physics, stacks, reducedMotion } = this.deps;
    const stack = this.stack as number;
    const targetPos = physics.position(s.target.targetId);
    const targetRot = physics.rotation(s.target.targetId);
    if (!targetPos || !targetRot) {
      physics.dropStack(stack);
      this.finish();
      return;
    }
    // Recomputed from the target's pose every frame, so a nudged target is still hit exactly.
    const position = toWorld(targetPos, targetRot, s.target.local.position);
    const rotation = multiplyQuat(targetRot, yawQuat((s.target.local.quarterTurns * Math.PI) / 2));

    if (s.placed) {
      const at = physics.stackPose(stack);
      const there = at && Math.hypot(at.position.x - position.x, at.position.y - position.y, at.position.z - position.z) < 1e-3;
      if (!there) {
        physics.carryStack(stack, position, rotation);
        return;
      }
      physics.mergeStack(stack, s.targetStack);
      stacks.merge(stack, s.target.targetId);
      this.finish();
      return;
    }

    s.elapsed += dt;
    const { blend, lift } = snapProgress(s.elapsed / CARRY.snapSeconds, !reducedMotion);
    const lerp = (a: number, b: number) => a + (b - a) * blend;
    const p = {
      x: lerp(s.from.position.x, position.x),
      y: lerp(s.from.position.y, position.y) + lift,
      z: lerp(s.from.position.z, position.z),
    };
    physics.carryStack(stack, p, nlerpQuat(s.from.rotation, rotation, blend));
    this.deps.view.setGhost(null);
    this.deps.view.setBlobShadow(null);
    if (s.elapsed >= CARRY.snapSeconds) {
      physics.carryStack(stack, position, rotation);
      s.placed = true;
    }
  }

  private finish(): void {
    this.reset();
  }

  /** Where each carried brick would be with the bottom brick at this pose (for the ghost). */
  private placed(position: Vec3, rotation: Quat): PlacedBrick[] {
    return this.members.map((id, i) => ({
      id,
      position: toWorld(position, rotation, this.parts[i].offset),
      rotation: multiplyQuat(rotation, yawQuat(this.parts[i].yaw)),
    }));
  }

  /** Radius around the bottom brick's center that covers every carried brick. */
  private radius(): number {
    return Math.max(...this.parts.map((p) => Math.hypot(p.offset.x, p.offset.z) + Math.hypot(p.width, p.depth) / 2));
  }

  private layers(): number {
    return this.stack === null ? 1 : this.deps.stacks.height(this.stack);
  }

  private partOf(id: number, bodyPos: Vec3, bodyRot: Quat): CarriedPart {
    const shape = this.deps.shapeOf(id);
    const p = this.deps.physics.position(id) ?? bodyPos;
    const r = this.deps.physics.rotation(id) ?? bodyRot;
    return {
      offset: toLocal(bodyPos, bodyRot, p),
      yaw: yawOf(multiplyQuat(conjugate(bodyRot), r)),
      width: shape?.width ?? 1,
      depth: shape?.depth ?? 1,
      height: shape?.height ?? 1,
    };
  }

  /** Every brick that isn't carried, as the snap math sees it. */
  private worldBricks(): WorldBrick[] {
    const { physics, stacks, shapeOf } = this.deps;
    const carried = new Set(this.members);
    const bricks: WorldBrick[] = [];
    physics.forEachPose((id, pose) => {
      const shape = shapeOf(id);
      const stack = stacks.stackOf(id);
      if (carried.has(id) || !shape || stack === null) return;
      bricks.push({
        id,
        center: pose.position,
        rotation: pose.rotation,
        width: shape.width,
        depth: shape.depth,
        height: shape.height,
        hasStuds: shape.hasStuds,
        settled: physics.isStill(id),
        level: stacks.member(id)?.level ?? 0,
        stackHeight: stacks.height(stack),
      });
    });
    return bricks;
  }

  private pointOnPlane(ray: PointerRay, y: number): { x: number; z: number } | null {
    if (Math.abs(ray.direction.y) < 1e-9) return null;
    const t = (y - ray.origin.y) / ray.direction.y;
    if (t < 0) return null;
    return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
  }
}
