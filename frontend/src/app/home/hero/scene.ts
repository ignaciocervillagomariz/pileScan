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
import { BrickInstance } from './pose';
import { QualityTier } from './quality';

export type Theme = 'light' | 'dark';

export interface SceneOptions {
  readonly tier: QualityTier;
  readonly theme: Theme;
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
  private readonly colors = PALETTE.map((c) => new Color(c.hex));
  private fit: CameraFit | null = null;

  constructor(canvas: HTMLCanvasElement, options: SceneOptions) {
    const { tier } = options;
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: tier.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.maxPixelRatio));
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = LIGHTING.exposure;
    this.renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap was removed in r186; PCF softness now comes from shadow.radius.
    this.renderer.shadowMap.type = PCFShadowMap;

    const pmrem = new PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    this.scene.environmentIntensity = LIGHTING.environmentIntensity;
    room.dispose();
    pmrem.dispose();

    this.keyLight = new DirectionalLight(LIGHTING.keyColor, LIGHTING.keyIntensity);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(tier.shadowMapSize, tier.shadowMapSize);
    this.keyLight.shadow.radius = tier.shadowRadius;
    this.keyLight.shadow.bias = LIGHTING.shadowBias;
    this.keyLight.shadow.normalBias = LIGHTING.shadowNormalBias;
    this.scene.add(this.keyLight, this.keyLight.target);

    this.ground = new Mesh(new PlaneGeometry(1, 1), this.groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.setTheme(options.theme);

    this.material = createBrickMaterial(tier.clearcoat);
    for (const shape of SHAPES) {
      this.geometries.set(shape.id, buildShapeGeometry(shape, { studSegments: tier.studSegments }));
    }
  }

  /** Fits camera, ground and shadow frustum to the hero box. Returns the visible ground. */
  resize(viewport: Viewport): CameraFit {
    this.renderer.setSize(viewport.widthPx, viewport.heightPx, false);
    this.camera.aspect = viewport.widthPx / viewport.heightPx;

    const fit = fitCamera(viewport, CAMERA.fovDeg);
    const tilt = (CAMERA.tiltDeg * Math.PI) / 180;
    this.camera.position.set(0, fit.distance * Math.cos(tilt), fit.distance * Math.sin(tilt));
    // Screen up is -Z, so the ground's +Z axis points down the screen.
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();

    const { ground } = fit;
    const width = ground.maxX - ground.minX;
    const depth = ground.maxZ - ground.minZ;
    // Generous ground so tilted framings and tumbling bricks never run off it.
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

    this.fit = fit;
    return fit;
  }

  get cameraFit(): CameraFit | null {
    return this.fit;
  }

  setTheme(theme: Theme): void {
    this.groundMaterial.opacity = LIGHTING.shadowOpacity[theme];
  }

  /** Replaces all bricks. One InstancedMesh per shape, sized to the bricks of that shape. */
  setBricks(bricks: readonly BrickInstance[]): void {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      mesh.dispose();
    }
    this.meshes.clear();

    const matrix = new Matrix4();
    const position = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3(1, 1, 1);
    for (const shape of SHAPES) {
      const ofShape = bricks.filter((b) => b.shapeId === shape.id);
      if (ofShape.length === 0) continue;
      const geometry = this.geometries.get(shape.id);
      if (!geometry) continue;
      const mesh = new InstancedMesh(geometry, this.material, ofShape.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      ofShape.forEach((b, i) => {
        position.set(b.position.x, b.position.y, b.position.z);
        rotation.set(b.rotation.x, b.rotation.y, b.rotation.z, b.rotation.w);
        mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
        mesh.setColorAt(i, this.colors[b.colorIndex]);
      });
      mesh.computeBoundingSphere();
      this.meshes.set(shape.id, mesh);
      this.scene.add(mesh);
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
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
