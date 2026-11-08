/**
 * Renderer, camera, lights and the shadow-catching ground. The visible surface (color, grain,
 * vignette) is CSS behind a transparent canvas, so the fallback and the 3D scene look the same.
 */
import {
  Color,
  DirectionalLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Scene,
  ShadowMaterial,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type MeshPhysicalMaterial,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildShapeGeometry, createBrickMaterial } from './bricks';
import { PALETTE, SHAPES } from './catalog';
import { CAMERA, LIGHTING } from './config';
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
}

const HIDDEN = new Matrix4().makeScale(0, 0, 0);

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
    return measureAsync('compile', () => this.renderer.compileAsync(this.scene, this.camera).then(() => undefined));
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
    const tilt = (fit.tiltDeg * Math.PI) / 180;
    this.camera.position.set(0, fit.distance * Math.cos(tilt), fit.distance * Math.sin(tilt));
    // Screen up is -Z, so the ground's +Z axis points down the screen (same pose as layout.ts).
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);
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
      this.slots.push({ mesh, index });
    }
    for (const mesh of this.meshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  setPose(id: number, position: Vec3, rotation: Quat): void {
    const slot = this.slots[id];
    if (!slot) return;
    this.position.set(position.x, position.y, position.z);
    this.rotation.set(rotation.x, rotation.y, rotation.z, rotation.w);
    slot.mesh.setMatrixAt(slot.index, this.matrix.compose(this.position, this.rotation, this.unitScale));
    this.dirty.add(slot.mesh);
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
    this.groundMaterial.dispose();
    this.ground.geometry.dispose();
    this.scene.environment?.dispose();
    this.keyLight.shadow.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
