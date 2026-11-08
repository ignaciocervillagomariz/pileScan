/**
 * Rapier world: a floor, invisible walls, and one dynamic body per brick. Colliders are
 * cuboids; studs are ignored for collisions. CCD keeps fast, thin plates from tunneling.
 */
import * as RAPIER from '@dimforge/rapier3d';
import { BrickShape } from './catalog';
import { DIMENSIONS, PHYSICS } from './config';
import { Cuboid } from './layout';
import { Quat, Vec3 } from './pose';

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

export class Physics {
  private readonly world: RAPIER.World;
  private readonly bricks = new Map<number, RAPIER.RigidBody>();
  private walls: RAPIER.RigidBody[] = [];

  constructor(gravity: number) {
    this.world = new RAPIER.World({ x: 0, y: -gravity, z: 0 });
    this.world.timestep = PHYSICS.step;
    this.world.numSolverIterations = PHYSICS.solverIterations;
    this.world.integrationParameters.maxCcdSubsteps = PHYSICS.ccdSubsteps;
    const floor = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -FLOOR.halfThickness, 0));
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(FLOOR.halfSize, FLOOR.halfThickness, FLOOR.halfSize)
        .setFriction(PHYSICS.friction)
        .setRestitution(PHYSICS.restitution),
      floor,
    );
  }

  setGravity(gravity: number): void {
    this.world.gravity = { x: 0, y: -gravity, z: 0 };
  }

  /** Replaces the walls (and the card keep-out block) after a resize. */
  setWalls(cuboids: readonly Cuboid[]): void {
    for (const wall of this.walls) this.world.removeRigidBody(wall);
    this.walls = cuboids.map((c) => {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(c.center.x, c.center.y, c.center.z),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(c.half.x, c.half.y, c.half.z).setFriction(0.2).setRestitution(PHYSICS.restitution),
        body,
      );
      return body;
    });
  }

  addBrick(id: number, spawn: BrickSpawn): void {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.position.x, spawn.position.y, spawn.position.z)
      .setRotation(spawn.rotation)
      .setLinvel(spawn.linvel.x, spawn.linvel.y, spawn.linvel.z)
      .setAngvel(spawn.angvel)
      .setLinearDamping(PHYSICS.linearDamping)
      .setAngularDamping(PHYSICS.angularDamping)
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(desc);
    const { shape } = spawn;
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        (shape.width - DIMENSIONS.sideGap) / 2,
        shape.height / 2,
        (shape.depth - DIMENSIONS.sideGap) / 2,
      )
        .setDensity(PHYSICS.density)
        .setFriction(PHYSICS.friction)
        .setRestitution(PHYSICS.restitution),
      body,
    );
    this.bricks.set(id, body);
  }

  removeAllBricks(): void {
    for (const body of this.bricks.values()) this.world.removeRigidBody(body);
    this.bricks.clear();
  }

  step(): void {
    this.world.step();
    for (const body of this.bricks.values()) {
      if (body.isSleeping()) continue;
      const v = body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      if (speed > PHYSICS.maxSpeed) {
        const k = PHYSICS.maxSpeed / speed;
        body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, false);
      }
    }
  }

  /** True when every brick sleeps: nothing will move until something touches them. */
  isResting(): boolean {
    for (const body of this.bricks.values()) {
      if (!body.isSleeping()) return false;
    }
    return true;
  }

  forEachPose(visit: (id: number, pose: BodyPose) => void): void {
    for (const [id, body] of this.bricks) {
      visit(id, { position: body.translation(), rotation: body.rotation() });
    }
  }

  /** Teleports a brick, e.g. back inside the walls after a resize, and wakes it. */
  moveBrick(id: number, x: number, z: number): void {
    const body = this.bricks.get(id);
    if (!body) return;
    const p = body.translation();
    body.setTranslation({ x, y: p.y + 0.5, z }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }

  /** Drops a brick again from `position` with no velocity (safety net for escapees). */
  redrop(id: number, position: Vec3): void {
    const body = this.bricks.get(id);
    if (!body) return;
    body.setTranslation(position, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  wakeAll(): void {
    for (const body of this.bricks.values()) body.wakeUp();
  }

  dispose(): void {
    this.world.free();
  }
}
