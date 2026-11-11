/**
 * Rapier world: a floor, invisible walls, one dynamic body per stack, and a kinematic pusher
 * that follows the pointer. Each brick is one cuboid collider (studs are ignored for
 * collisions); a stack is one compound body whose frame is its bottom brick's, and the stack's
 * id is that brick's id. CCD keeps fast, thin plates from tunneling.
 *
 * A carried stack is kinematic and in a collision group that touches nothing: it flies over the
 * other bricks without pushing them, and the hero clamps it inside the walls in code.
 */
import type * as Rapier from '@dimforge/rapier3d';

/**
 * The Rapier module, passed in rather than imported: the app loads `@dimforge/rapier3d` (a
 * separate .wasm file), and the unit tests load the same version as `@dimforge/rapier3d-compat`
 * (wasm inlined), because the test runner can't import a .wasm file.
 */
export type RapierModule = typeof Rapier;
import { BrickShape } from './catalog';
import { DIMENSIONS, PHYSICS, PUSH } from './config';
import { Cuboid } from './layout';
import { conjugate, multiplyQuat, Quat, toLocal, toWorld, Vec3 } from './pose';

export interface BodyPose {
  readonly position: Vec3;
  readonly rotation: Quat;
}

export interface BrickSpawn {
  readonly shape: BrickShape;
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly linvel: Vec3;
  readonly angvel: Vec3;
}

/** Thick enough that nothing tunnels through it, wide enough for any screen. */
const FLOOR = { halfSize: 500, halfThickness: 1 } as const;

/** Where the pusher waits, far below the floor, while nobody pushes. */
const PARKED = { x: 0, y: -100, z: 0 } as const;

/** Below these speeds (studs/s, rad/s) a body counts as still. */
const STILL = { linear: 0.05, angular: 0.1 } as const;

/** Centre height of the pusher: its straight part spans y = 0 to a brick's height. */
export const PUSHER_Y = PUSH.halfHeight;

/**
 * Collision groups: membership in the high 16 bits, filter in the low 16 (Rapier's layout).
 * Built with arithmetic, not `<< 16`, which would turn 0xffff into a negative number.
 */
const GROUP = { brick: 0x1, pusher: 0x2, static: 0x4, carried: 0x8, all: 0xffff } as const;
const groups = (membership: number, filter: number) => membership * 0x10000 + filter;
const BRICK_GROUPS = groups(GROUP.brick, GROUP.all);
/** A hovered brick: collides with everything except the pusher, so it doesn't flee the cursor. */
const BRICK_IGNORING_PUSHER = groups(GROUP.brick, GROUP.all & ~GROUP.pusher);
const PUSHER_GROUPS = groups(GROUP.pusher, GROUP.brick);
const STATIC_GROUPS = groups(GROUP.static, GROUP.all);
/** A carried stack collides with nothing, not even the walls. */
const CARRIED_GROUPS = groups(GROUP.carried, 0);
const QUERY_BRICKS = groups(GROUP.all, GROUP.brick);

export class Physics {
  private readonly world: Rapier.World;
  /** One body per stack, keyed by the stack id (its bottom brick's id). */
  private readonly bodies = new Map<number, Rapier.RigidBody>();
  private readonly brickByCollider = new Map<number, number>();
  private readonly colliders = new Map<number, Rapier.Collider>();
  private readonly shapes = new Map<number, BrickShape>();
  private walls: Rapier.RigidBody[] = [];
  private readonly pusher: Rapier.RigidBody;
  private readonly pusherCollider: Rapier.Collider;
  private pusherTarget: { x: number; z: number } | null = null;
  /** Same shape as the pusher, for overlap queries. */
  private readonly probe: Rapier.Capsule;

  /** @param pusherMaxSpeed studs/s; lower under prefers-reduced-motion. */
  constructor(
    private readonly rapier: RapierModule,
    gravity: number,
    private readonly pusherMaxSpeed: number = PUSH.maxSpeed,
  ) {
    this.probe = new rapier.Capsule(PUSH.halfHeight, PUSH.radius);
    this.world = new rapier.World({ x: 0, y: -gravity, z: 0 });
    this.world.timestep = PHYSICS.step;
    this.world.numSolverIterations = PHYSICS.solverIterations;
    this.world.integrationParameters.maxCcdSubsteps = PHYSICS.ccdSubsteps;
    const floor = this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(0, -FLOOR.halfThickness, 0));
    this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(FLOOR.halfSize, FLOOR.halfThickness, FLOOR.halfSize)
        .setFriction(PHYSICS.friction)
        .setRestitution(PHYSICS.restitution)
        .setCollisionGroups(STATIC_GROUPS),
      floor,
    );
    this.pusher = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(PARKED.x, PARKED.y, PARKED.z),
    );
    this.pusherCollider = this.world.createCollider(
      this.rapier.ColliderDesc.capsule(PUSH.halfHeight, PUSH.radius)
        .setFriction(0.3)
        .setCollisionGroups(PUSHER_GROUPS)
        .setEnabled(false),
      this.pusher,
    );
  }

  /** Where the pusher is while active (for the debug overlay and the exclusion rule). */
  get pusherPosition(): { x: number; z: number } | null {
    if (!this.pusherTarget) return null;
    const p = this.pusher.translation();
    return { x: p.x, z: p.z };
  }

  get pushing(): boolean {
    return this.pusherTarget !== null;
  }

  /** True while the pusher still travels toward the pointer (a still pusher pushes nothing). */
  get pusherMoving(): boolean {
    const target = this.pusherTarget;
    if (!target) return false;
    const p = this.pusher.translation();
    return Math.hypot(target.x - p.x, target.z - p.z) > 1e-4;
  }

  /**
   * Starts, moves or (with null) stops the pusher. When it starts it is teleported to the
   * pointer, so it never sweeps across the table from where it was parked.
   */
  setPusher(target: { x: number; z: number } | null): void {
    if (target === null) {
      if (this.pusherTarget === null) return;
      this.pusherTarget = null;
      this.pusherCollider.setEnabled(false);
      this.pusher.setTranslation(PARKED, false);
      return;
    }
    if (this.pusherTarget === null) {
      this.pusher.setTranslation({ x: target.x, y: PUSHER_Y, z: target.z }, true);
      this.pusherCollider.setEnabled(true);
    }
    this.pusherTarget = target;
  }

  /**
   * Moves the pusher to the pointer each step, so its velocity is the pointer's: slow moves
   * nudge, fast moves shove. Capped so a flick can't launch bricks.
   */
  private advancePusher(): void {
    const target = this.pusherTarget;
    if (!target) return;
    const p = this.pusher.translation();
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const distance = Math.hypot(dx, dz);
    const maxStep = this.pusherMaxSpeed * PHYSICS.step;
    const k = distance > maxStep ? maxStep / distance : 1;
    this.pusher.setNextKinematicTranslation({ x: p.x + dx * k, y: PUSHER_Y, z: p.z + dz * k });
  }

  /** The brick hit first by a ray (camera through the pointer), or null. */
  brickAt(origin: Vec3, direction: Vec3): number | null {
    const hit = this.world.castRay(new this.rapier.Ray(origin, direction), 1e4, true, undefined, QUERY_BRICKS);
    return hit ? (this.brickByCollider.get(hit.collider.handle) ?? null) : null;
  }

  /**
   * Bricks the pusher capsule would overlap if it stood at (x, z), nearest first. Lets the
   * hover rule claim the brick a slow cursor is about to touch, before the contact nudges it.
   */
  bricksTouching(x: number, z: number): number[] {
    const found: { id: number; distance: number }[] = [];
    this.world.intersectionsWithShape(
      { x, y: PUSHER_Y, z },
      { x: 0, y: 0, z: 0, w: 1 },
      this.probe,
      (collider) => {
        const id = this.brickByCollider.get(collider.handle);
        const p = id === undefined ? null : this.position(id);
        if (id !== undefined && p) found.push({ id, distance: Math.hypot(p.x - x, p.z - z) });
        return true;
      },
      undefined,
      QUERY_BRICKS,
    );
    return found.sort((a, b) => a.distance - b.distance).map((f) => f.id);
  }

  /** Lets one brick pass through the pusher (it was there when the pusher appeared), or restores it. */
  setIgnoresPusher(id: number, ignores: boolean): void {
    const collider = this.colliders.get(id);
    if (!collider || collider.parent()?.isKinematic()) return;
    collider.setCollisionGroups(ignores ? BRICK_IGNORING_PUSHER : BRICK_GROUPS);
  }

  setGravity(gravity: number): void {
    this.world.gravity = { x: 0, y: -gravity, z: 0 };
  }

  /** Replaces the walls (and the card keep-out block) after a resize. */
  setWalls(cuboids: readonly Cuboid[]): void {
    for (const wall of this.walls) this.world.removeRigidBody(wall);
    this.walls = cuboids.map((c) => {
      const body = this.world.createRigidBody(
        this.rapier.RigidBodyDesc.fixed().setTranslation(c.center.x, c.center.y, c.center.z),
      );
      this.world.createCollider(
        this.rapier.ColliderDesc.cuboid(c.half.x, c.half.y, c.half.z)
          .setFriction(0.2)
          .setRestitution(PHYSICS.restitution)
          .setCollisionGroups(STATIC_GROUPS),
        body,
      );
      return body;
    });
  }

  addBrick(id: number, spawn: BrickSpawn): void {
    const desc = this.rapier.RigidBodyDesc.dynamic()
      .setTranslation(spawn.position.x, spawn.position.y, spawn.position.z)
      .setRotation(spawn.rotation)
      .setLinvel(spawn.linvel.x, spawn.linvel.y, spawn.linvel.z)
      .setAngvel(spawn.angvel)
      .setLinearDamping(PHYSICS.linearDamping)
      .setAngularDamping(PHYSICS.angularDamping)
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(desc);
    this.bodies.set(id, body);
    this.shapes.set(id, spawn.shape);
    this.attachCollider(id, body, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
  }

  private attachCollider(id: number, body: Rapier.RigidBody, local: Vec3, rotation: Quat): void {
    const shape = this.shapes.get(id);
    if (!shape) return;
    const collider = this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(
        (shape.width - DIMENSIONS.sideGap) / 2,
        shape.height / 2,
        (shape.depth - DIMENSIONS.sideGap) / 2,
      )
        .setTranslation(local.x, local.y, local.z)
        .setRotation(rotation)
        .setDensity(PHYSICS.density)
        .setFriction(PHYSICS.friction)
        .setRestitution(PHYSICS.restitution)
        .setCollisionGroups(body.isKinematic() ? CARRIED_GROUPS : BRICK_GROUPS),
      body,
    );
    this.colliders.set(id, collider);
    this.brickByCollider.set(collider.handle, id);
  }

  removeAllBricks(): void {
    for (const body of this.bodies.values()) this.world.removeRigidBody(body);
    this.bodies.clear();
    this.colliders.clear();
    this.brickByCollider.clear();
    this.shapes.clear();
  }

  /** Pose of a stack's body, which is its bottom brick's pose. */
  stackPose(stack: number): BodyPose | null {
    const body = this.bodies.get(stack);
    return body ? { position: body.translation(), rotation: body.rotation() } : null;
  }

  /** Picks a stack up: kinematic, touching nothing, until `dropStack` or `mergeStack`. */
  liftStack(stack: number): void {
    const body = this.bodies.get(stack);
    if (!body) return;
    body.setBodyType(this.rapier.RigidBodyType.KinematicPositionBased, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.forEachCollider(body, (c) => c.setCollisionGroups(CARRIED_GROUPS));
  }

  /** Moves a lifted stack to this pose during the next step. */
  carryStack(stack: number, position: Vec3, rotation: Quat): void {
    const body = this.bodies.get(stack);
    if (!body?.isKinematic()) return;
    body.setNextKinematicTranslation(position);
    body.setNextKinematicRotation(rotation);
  }

  /** Lets a lifted stack fall from where it is; it collides normally again at once. */
  dropStack(stack: number): void {
    const body = this.bodies.get(stack);
    if (!body?.isKinematic()) return;
    body.setBodyType(this.rapier.RigidBodyType.Dynamic, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.forEachCollider(body, (c) => c.setCollisionGroups(BRICK_GROUPS));
  }

  /**
   * Joins a lifted stack to another stack's body, keeping every brick exactly where it is now.
   * Rapier can't move a collider to another body, so each one is recreated on the target.
   */
  mergeStack(carried: number, into: number): void {
    const from = this.bodies.get(carried);
    const to = this.bodies.get(into);
    if (!from || !to || from === to) return;
    const fromPos = from.translation();
    const fromRot = from.rotation();
    const toPos = to.translation();
    const toRot = to.rotation();
    const moved: { id: number; local: Vec3; rotation: Quat }[] = [];
    this.forEachCollider(from, (c) => {
      const id = this.brickByCollider.get(c.handle);
      const offset = c.translationWrtParent();
      const turn = c.rotationWrtParent();
      if (id === undefined || !offset || !turn) return;
      const world = toWorld(fromPos, fromRot, offset);
      moved.push({ id, local: toLocal(toPos, toRot, world), rotation: multiplyQuat(conjugate(toRot), multiplyQuat(fromRot, turn)) });
    });
    for (const m of moved) {
      const old = this.colliders.get(m.id);
      if (old) {
        this.brickByCollider.delete(old.handle);
        this.world.removeCollider(old, false);
      }
      this.attachCollider(m.id, to, m.local, m.rotation);
    }
    this.world.removeRigidBody(from);
    this.bodies.delete(carried);
    to.wakeUp();
  }

  private forEachCollider(body: Rapier.RigidBody, visit: (c: Rapier.Collider) => void): void {
    const all: Rapier.Collider[] = [];
    for (let i = 0; i < body.numColliders(); i++) all.push(body.collider(i));
    all.forEach(visit);
  }

  step(): void {
    this.advancePusher();
    this.world.step();
    for (const body of this.bodies.values()) {
      if (body.isSleeping() || body.isKinematic()) continue;
      const v = body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      if (speed > PHYSICS.maxSpeed) {
        const k = PHYSICS.maxSpeed / speed;
        body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, false);
      }
    }
  }

  /** True when every stack sleeps: nothing will move until something touches them. */
  isResting(): boolean {
    for (const body of this.bodies.values()) {
      if (!body.isSleeping() && !body.isKinematic()) return false;
    }
    return true;
  }

  isSleeping(id: number): boolean {
    return this.colliders.get(id)?.parent()?.isSleeping() ?? true;
  }

  /**
   * At rest for practical purposes: asleep, or barely moving. Rapier only puts a body to sleep
   * after a while, and a stack that was just built must be a snap target right away.
   */
  isStill(id: number): boolean {
    const body = this.colliders.get(id)?.parent();
    if (!body || body.isSleeping()) return true;
    if (body.isKinematic()) return false;
    const v = body.linvel();
    const w = body.angvel();
    return Math.hypot(v.x, v.y, v.z) < STILL.linear && Math.hypot(w.x, w.y, w.z) < STILL.angular;
  }

  /** World pose of every brick (stack members included). */
  forEachPose(visit: (id: number, pose: BodyPose) => void): void {
    for (const [id, collider] of this.colliders) {
      visit(id, { position: collider.translation(), rotation: collider.rotation() });
    }
  }

  position(id: number): Vec3 | null {
    return this.colliders.get(id)?.translation() ?? null;
  }

  rotation(id: number): Quat | null {
    return this.colliders.get(id)?.rotation() ?? null;
  }

  /** Teleports the stack holding this brick so the brick lands at (x, z), and wakes it. */
  moveBrick(id: number, x: number, z: number): void {
    const p = this.position(id);
    const body = this.colliders.get(id)?.parent();
    if (!p || !body || body.isKinematic()) return;
    const b = body.translation();
    body.setTranslation({ x: b.x + x - p.x, y: b.y + 0.5, z: b.z + z - p.z }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }

  /** Drops the stack holding this brick again from `position`, at rest (safety net for escapees). */
  redrop(id: number, position: Vec3): void {
    const body = this.colliders.get(id)?.parent();
    if (!body || body.isKinematic()) return;
    body.setTranslation(position, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  wakeAll(): void {
    for (const body of this.bodies.values()) body.wakeUp();
  }

  dispose(): void {
    this.world.free();
  }
}
