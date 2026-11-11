/**
 * Renderer, camera, lights and the shadow-catching ground. The visible surface (color, grain,
 * vignette) is CSS behind a transparent canvas, so the fallback and the 3D scene look the same.
 */
import {
  CanvasTexture,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Raycaster,
  Scene,
  ShadowMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type MeshPhysicalMaterial,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { approach, settled } from './ambient';
import { buildShapeGeometry, createBrickMaterial } from './bricks';
import { PALETTE, SHAPES } from './catalog';
import { AMBIENT, CAMERA, CARRY, LIGHTING, PUSH } from './config';
import { CameraFit, fitCamera, Viewport } from './layout';
import { measure, measureAsync } from './perf';
import { Quat, Vec3 } from './pose';
import { QualityTier } from './quality';

export type Theme = 'light' | 'dark';

export interface SceneOptions {
  readonly tier: QualityTier;
  readonly theme: Theme;
}

/** What the scene needs to know about a brick before it has a pose. */
export interface BrickLook {
  readonly shapeId: string;
  readonly colorIndex: number;
}

interface Slot {
  readonly mesh: InstancedMesh;
  readonly index: number;
  readonly look: BrickLook;
}

/** A brick drawn outside its instanced mesh: carried (no shadow of its own) or a ghost. */
export interface PlacedBrick {
  readonly id: number;
  readonly position: Vec3;
  readonly rotation: Quat;
}

/** The soft shadow under a carried stack, on whatever surface is under it. */
export interface BlobShadow {
  readonly x: number;
  readonly z: number;
  /** Height of the surface it lies on. */
  readonly surfaceY: number;
  readonly width: number;
  readonly depth: number;
  readonly yaw: number;
  /** How far the stack's bottom is above that surface. */
  readonly height: number;
}

/** Hovered stacks are tinted this far toward white. */
const HIGHLIGHT = 0.16;
/** Ghost bricks at the snap target. */
const GHOST_OPACITY = 0.38;

const HIDDEN = new Matrix4().makeScale(0, 0, 0);
const WHITE = new Color(1, 1, 1);

/** A soft round shadow: opaque in the middle, fading to nothing at the edge. */
function blobTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (g) {
    const r = size / 2;
    const gradient = g.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);
  }
  // The map's color multiplies the black material, so only its alpha matters.
  return new CanvasTexture(canvas);
}

export class HeroScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(CAMERA.fovDeg, 1, CAMERA.near, CAMERA.far);
  private readonly keyLight: DirectionalLight;
  private readonly groundMaterial = new ShadowMaterial();
  private readonly ground: Mesh;
  private readonly material: MeshPhysicalMaterial;
  private readonly geometries = new Map<string, BufferGeometry>();
  private readonly meshes = new Map<string, InstancedMesh>();
  private readonly slots: Slot[] = [];
  private readonly dirty = new Set<InstancedMesh>();
  private readonly colors = PALETTE.map((c) => new Color(c.hex));
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly unitScale = new Vector3(1, 1, 1);
  private readonly studSegments: number;
  private rendered = false;
  private fit: CameraFit | null = null;
  /** Current and target camera orbit offsets (radians) for the pointer parallax. */
  private parallax = { yaw: 0, pitch: 0 };
  private parallaxTarget = { yaw: 0, pitch: 0 };
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  /** ?debug=1 only: wireframe of the pusher capsule. */
  private debugPusher: Mesh | null = null;
  /** Carried bricks: drawn as plain meshes so they cast no shadow (the blob shows where they are). */
  private readonly carried = new Map<number, Mesh>();
  private readonly ghosts = new Map<number, Mesh>();
  private readonly solidMaterials = new Map<number, MeshPhysicalMaterial>();
  private readonly ghostMaterials = new Map<number, MeshPhysicalMaterial>();
  private readonly blob: Mesh;
  private readonly blobMaterial: MeshBasicMaterial;
  private highlighted = new Set<number>();

  constructor(canvas: HTMLCanvasElement, options: SceneOptions) {
    const { tier } = options;
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: tier.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = LIGHTING.exposure;
    this.renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap was removed in r186; PCF softness now comes from shadow.radius.
    this.renderer.shadowMap.type = PCFShadowMap;

    this.scene.environmentIntensity = LIGHTING.environmentIntensity;

    this.keyLight = new DirectionalLight(LIGHTING.keyColor, LIGHTING.keyIntensity);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.bias = LIGHTING.shadowBias;
    this.keyLight.shadow.normalBias = LIGHTING.shadowNormalBias;
    this.scene.add(this.keyLight, this.keyLight.target);
    this.applyTier(tier);

    this.ground = new Mesh(new PlaneGeometry(1, 1), this.groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.setTheme(options.theme);

    this.material = createBrickMaterial(tier.clearcoat);
    this.studSegments = tier.studSegments;

    this.blobMaterial = new MeshBasicMaterial({
      color: 0x000000,
      map: blobTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    this.blob = new Mesh(new PlaneGeometry(1, 1), this.blobMaterial);
    this.blob.rotation.order = 'YXZ';
    this.blob.rotation.x = -Math.PI / 2;
    this.scene.add(this.blob);
  }

  /**
   * The expensive set-up, one step per task: the page stays responsive (no long task blocks a
   * tap on the call to action) while the scene gets ready.
   */
  async prepare(yieldToMain: () => Promise<void>): Promise<void> {
    await yieldToMain();
    measure('environment', () => {
      const pmrem = new PMREMGenerator(this.renderer);
      const room = new RoomEnvironment();
      this.scene.environment = pmrem.fromScene(room, 0.04).texture;
      room.dispose();
      pmrem.dispose();
    });
    await yieldToMain();
    measure('geometry', () => {
      for (const shape of SHAPES) {
        this.geometries.set(shape.id, buildShapeGeometry(shape, { studSegments: this.studSegments }));
      }
    });
  }

  /**
   * Compiles every shader before the first frame. With KHR_parallel_shader_compile the driver
   * links them off the main thread; otherwise the first render would compile them in one block.
   */
  precompile(): Promise<void> {
    // Stand-ins for a carried brick and a ghost, so their shaders compile now and the first
    // grab doesn't stall on a shader compile.
    const geometry = this.geometries.values().next().value;
    const standIns = geometry
      ? [new Mesh(geometry, this.solidMaterial(0)), new Mesh(geometry, this.ghostMaterial(0))]
      : [];
    for (const m of standIns) this.scene.add(m);
    return measureAsync('compile', () => this.renderer.compileAsync(this.scene, this.camera)).then(() => {
      for (const m of standIns) this.scene.remove(m);
    });
  }

  /** Pixel ratio and shadow cost; called again when the runtime downgrades the tier. */
  applyTier(tier: QualityTier): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.maxPixelRatio));
    const shadow = this.keyLight.shadow;
    if (shadow.mapSize.x !== tier.shadowMapSize) {
      shadow.mapSize.set(tier.shadowMapSize, tier.shadowMapSize);
      // The shadow map is reallocated at the new size on the next render.
      shadow.map?.dispose();
      shadow.map = null;
    }
    shadow.radius = tier.shadowRadius;
  }

  /** Fits camera, ground and shadow frustum to the hero box. Returns the visible ground. */
  resize(viewport: Viewport): CameraFit {
    this.renderer.setSize(viewport.widthPx, viewport.heightPx, false);
    this.camera.aspect = viewport.widthPx / viewport.heightPx;

    const fit = fitCamera(viewport, CAMERA.fovDeg, CAMERA.tiltDeg);
    this.fit = fit;
    this.placeCamera();
    this.camera.updateProjectionMatrix();

    const { ground } = fit;
    const width = ground.maxX - ground.minX;
    const depth = ground.maxZ - ground.minZ;
    // Generous ground so the tilted framing and tumbling bricks never run off it.
    this.ground.scale.set(width * 2, depth * 2, 1);

    const reach = Math.max(width, depth) / 2 + LIGHTING.shadowMargin;
    const dir = new Vector3(LIGHTING.keyDirection.x, LIGHTING.keyDirection.y, LIGHTING.keyDirection.z)
      .normalize()
      .multiplyScalar(reach * 2);
    this.keyLight.position.copy(dir);
    const shadowCam = this.keyLight.shadow.camera;
    shadowCam.left = -reach;
    shadowCam.right = reach;
    shadowCam.top = reach;
    shadowCam.bottom = -reach;
    shadowCam.near = 0.1;
    shadowCam.far = reach * 4;
    shadowCam.updateProjectionMatrix();
    return fit;
  }

  /**
   * The layout.ts pose (tilted, looking at the origin, screen-up = -Z), orbited by the parallax
   * offsets: yaw swings the camera sideways, pitch adds to the tilt.
   */
  private placeCamera(): void {
    if (!this.fit) return;
    const d = this.fit.distance;
    const tilt = (this.fit.tiltDeg * Math.PI) / 180 + this.parallax.pitch;
    const yaw = this.parallax.yaw;
    this.camera.position.set(d * Math.sin(yaw), d * Math.cos(yaw) * Math.cos(tilt), d * Math.cos(yaw) * Math.sin(tilt));
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);
  }

  /** Sets where the parallax should ease to (radians); see ambient.ts. */
  setParallaxTarget(yaw: number, pitch: number): void {
    this.parallaxTarget = { yaw, pitch };
  }

  /** Eases the camera toward its parallax target. Returns true while still moving. */
  updateParallax(dtSeconds: number): boolean {
    const t = this.parallaxTarget;
    const moving = !settled(this.parallax.yaw, t.yaw, 1e-5) || !settled(this.parallax.pitch, t.pitch, 1e-5);
    if (!moving) return false;
    this.parallax = {
      yaw: approach(this.parallax.yaw, t.yaw, AMBIENT.parallaxRate, dtSeconds),
      pitch: approach(this.parallax.pitch, t.pitch, AMBIENT.parallaxRate, dtSeconds),
    };
    this.placeCamera();
    return true;
  }

  /** The ray from the camera through a canvas pixel, with the camera as it is now. */
  rayAt(xPx: number, yPx: number): { origin: Vec3; direction: Vec3 } | null {
    if (!this.fit) return null;
    const { widthPx, heightPx } = this.fit.viewport;
    this.ndc.set((xPx / widthPx) * 2 - 1, 1 - (yPx / heightPx) * 2);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const { origin, direction } = this.raycaster.ray;
    return { origin: { x: origin.x, y: origin.y, z: origin.z }, direction: { x: direction.x, y: direction.y, z: direction.z } };
  }

  /** ?debug=1: shows the pusher capsule where physics has it (null hides it). */
  setDebugPusher(position: { x: number; y: number; z: number } | null): void {
    if (!this.debugPusher) {
      this.debugPusher = new Mesh(
        new CapsuleGeometry(PUSH.radius, PUSH.halfHeight * 2, 4, 12),
        new MeshBasicMaterial({ color: 0xe11d48, wireframe: true, transparent: true, opacity: 0.8 }),
      );
      this.scene.add(this.debugPusher);
    }
    this.debugPusher.visible = position !== null;
    if (position) this.debugPusher.position.set(position.x, position.y, position.z);
  }

  setTheme(theme: Theme): void {
    this.groundMaterial.opacity = LIGHTING.shadowOpacity[theme];
  }

  /**
   * Allocates one hidden instance per brick (id = index in `bricks`), one InstancedMesh per
   * shape. Bricks appear once they get a pose.
   */
  setBricks(bricks: readonly BrickLook[]): void {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      mesh.dispose();
    }
    this.meshes.clear();
    this.slots.length = 0;
    this.setCarried([]);
    for (const mesh of this.ghosts.values()) this.scene.remove(mesh);
    this.ghosts.clear();
    this.highlighted.clear();
    this.setBlobShadow(null);

    const counts = new Map<string, number>();
    for (const b of bricks) counts.set(b.shapeId, (counts.get(b.shapeId) ?? 0) + 1);
    for (const [shapeId, count] of counts) {
      const geometry = this.geometries.get(shapeId);
      if (!geometry) throw new Error(`Unknown shape ${shapeId}`);
      const mesh = new InstancedMesh(geometry, this.material, count);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Instances move every frame: a stale bounding sphere would cull visible bricks.
      mesh.frustumCulled = false;
      this.meshes.set(shapeId, mesh);
      this.scene.add(mesh);
    }

    const next = new Map<string, number>();
    for (const b of bricks) {
      const mesh = this.meshes.get(b.shapeId);
      if (!mesh) continue;
      const index = next.get(b.shapeId) ?? 0;
      next.set(b.shapeId, index + 1);
      mesh.setMatrixAt(index, HIDDEN);
      mesh.setColorAt(index, this.colors[b.colorIndex]);
      this.slots.push({ mesh, index, look: b });
    }
    for (const mesh of this.meshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /** `lift` raises the brick visually only (the Glove's hover hint); physics is unaffected. */
  setPose(id: number, position: Vec3, rotation: Quat, lift = 0): void {
    const slot = this.slots[id];
    if (!slot) return;
    const carried = this.carried.get(id);
    if (carried) {
      carried.position.set(position.x, position.y, position.z);
      carried.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      return;
    }
    this.position.set(position.x, position.y + lift, position.z);
    this.rotation.set(rotation.x, rotation.y, rotation.z, rotation.w);
    slot.mesh.setMatrixAt(slot.index, this.matrix.compose(this.position, this.rotation, this.unitScale));
    this.dirty.add(slot.mesh);
  }

  /**
   * Draws these bricks as carried: out of the instanced meshes and out of the shadow map (the
   * blob shadow takes over). An empty list puts every carried brick back.
   */
  setCarried(ids: readonly number[]): void {
    for (const [id, mesh] of this.carried) {
      if (ids.includes(id)) continue;
      this.scene.remove(mesh);
      this.carried.delete(id);
    }
    for (const id of ids) {
      const slot = this.slots[id];
      if (!slot || this.carried.has(id)) continue;
      const mesh = new Mesh(slot.mesh.geometry, this.solidMaterial(slot.look.colorIndex));
      mesh.receiveShadow = true;
      this.carried.set(id, mesh);
      this.scene.add(mesh);
      slot.mesh.setMatrixAt(slot.index, HIDDEN);
      this.dirty.add(slot.mesh);
    }
  }

  /** Translucent copies of the carried bricks at their snap target; null hides them. */
  setGhost(bricks: readonly PlacedBrick[] | null): void {
    const shown = new Set(bricks?.map((b) => b.id) ?? []);
    for (const [id, mesh] of this.ghosts) mesh.visible = shown.has(id);
    for (const b of bricks ?? []) {
      const slot = this.slots[b.id];
      if (!slot) continue;
      let mesh = this.ghosts.get(b.id);
      if (!mesh) {
        mesh = new Mesh(slot.mesh.geometry, this.ghostMaterial(slot.look.colorIndex));
        mesh.renderOrder = 1;
        this.ghosts.set(b.id, mesh);
        this.scene.add(mesh);
      }
      mesh.visible = true;
      mesh.position.set(b.position.x, b.position.y, b.position.z);
      mesh.quaternion.set(b.rotation.x, b.rotation.y, b.rotation.z, b.rotation.w);
    }
  }

  setBlobShadow(blob: BlobShadow | null): void {
    if (!blob) {
      this.blobMaterial.opacity = 0;
      return;
    }
    // Higher means softer, larger and fainter, like a real shadow under a lifted object.
    const spread = 1 + blob.height * 0.25;
    this.blob.position.set(blob.x, blob.surfaceY + 0.01, blob.z);
    this.blob.rotation.y = blob.yaw;
    this.blob.scale.set((blob.width + 0.6) * spread, (blob.depth + 0.6) * spread, 1);
    this.blobMaterial.opacity = CARRY.blobOpacity * Math.exp(-CARRY.blobFadePerStud * blob.height);
  }

  /** Tints the hovered stack's bricks slightly toward white. */
  setHighlight(ids: ReadonlySet<number>): void {
    const changed = [...this.highlighted, ...ids].filter((id) => this.highlighted.has(id) !== ids.has(id));
    this.highlighted = new Set(ids);
    for (const id of changed) {
      const slot = this.slots[id];
      if (!slot) continue;
      const base = this.colors[slot.look.colorIndex];
      slot.mesh.setColorAt(slot.index, ids.has(id) ? base.clone().lerp(WHITE, HIGHLIGHT) : base);
      if (slot.mesh.instanceColor) slot.mesh.instanceColor.needsUpdate = true;
    }
  }

  private solidMaterial(colorIndex: number): MeshPhysicalMaterial {
    let m = this.solidMaterials.get(colorIndex);
    if (!m) {
      m = this.material.clone();
      m.color.copy(this.colors[colorIndex]);
      this.solidMaterials.set(colorIndex, m);
    }
    return m;
  }

  private ghostMaterial(colorIndex: number): MeshPhysicalMaterial {
    let m = this.ghostMaterials.get(colorIndex);
    if (!m) {
      m = this.material.clone();
      m.color.copy(this.colors[colorIndex]);
      m.transparent = true;
      m.opacity = GHOST_OPACITY;
      m.depthWrite = false;
      this.ghostMaterials.set(colorIndex, m);
    }
    return m;
  }

  render(): void {
    for (const mesh of this.dirty) mesh.instanceMatrix.needsUpdate = true;
    this.dirty.clear();
    if (this.rendered) {
      this.renderer.render(this.scene, this.camera);
    } else {
      measure('first-render', () => this.renderer.render(this.scene, this.camera));
      this.rendered = true;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) mesh.dispose();
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.material.dispose();
    for (const m of [...this.solidMaterials.values(), ...this.ghostMaterials.values()]) m.dispose();
    this.blob.geometry.dispose();
    this.blobMaterial.map?.dispose();
    this.blobMaterial.dispose();
    this.groundMaterial.dispose();
    if (this.debugPusher) {
      this.debugPusher.geometry.dispose();
      (this.debugPusher.material as MeshBasicMaterial).dispose();
    }
    this.ground.geometry.dispose();
    this.scene.environment?.dispose();
    this.keyLight.shadow.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
