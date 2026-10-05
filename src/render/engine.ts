import {
  ACESFilmicToneMapping,
  HalfFloatType,
  PerspectiveCamera,
  Scene,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BODIES, BODY } from '../data/bodies';
import { eclToScene, type V3 } from '../physics/frames';
import type { Simulation } from '../physics/simulation';
import { J2000, kmToAu } from '../core/units';
import { AtlasCamera, LOGD_MAX } from './camera';
import { BodiesLayer } from './bodies';
import { LinesLayer } from './lines';
import { SpaceLayers } from './space';
import { configureTextures } from './textures';
import type { Frame } from './frame';
import { GRADE_FRAG } from './shaders/points';

export interface ViewOptions {
  illus: boolean;
  orbits: boolean;
  trails: boolean;
  labels: boolean;
  smallBodies: boolean;
  selected: string | null;
  reducedMotion: boolean;
}

const GRADE = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.55 }, uRes: { value: new Vector2(1, 1) } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: GRADE_FRAG,
};

export class Engine {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(42, 1, 1e-7, 1e12);
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly grade: ShaderPass;
  readonly atlasCam = new AtlasCamera();
  readonly bodies: BodiesLayer;
  readonly lines: LinesLayer;
  readonly space: SpaceLayers;
  readonly frame: Frame;
  private mix = { illus: 1, orbits: 1, trails: 1, small: 1 };
  private time = 0;
  width = 1;
  height = 1;
  /** desired / current shift of the image centre in CSS px (panels on the side) */
  shiftTarget = { x: 0, y: 0 };
  private shift = { x: 0, y: 0 };

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly sim: Simulation,
    readonly mobile: boolean,
    baseUrl: string,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance', alpha: false });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x05080f, 1);
    configureTextures(this.renderer, `${baseUrl}textures/`);
    const rt = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: mobile ? 0 : 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new Vector2(256, 256), 0.62, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GRADE);
    this.composer.addPass(this.grade);

    this.bodies = new BodiesLayer(this.scene, this.camera);
    this.lines = new LinesLayer(this.scene, this.bodies);
    this.space = new SpaceLayers(this.scene, mobile, baseUrl);
    this.bodies.hiResAllowed = !mobile;

    this.frame = {
      sim,
      camera: this.camera,
      cam: [0, 0, 0],
      focus: [0, 0, 0],
      s: 1,
      logD: 1,
      focusKey: 'sun',
      selectedKey: null,
      days: 0,
      time: 0,
      dt: 0,
      width: 1,
      height: 1,
      dpr: 1,
      pxPerRad: 1,
      illus: 1,
      pos: new Map(),
      showOrbits: 1,
      showTrails: 1,
      showSmallBodies: 1,
      showLabels: true,
      galBlend: 0,
      reducedMotion: false,
    };
  }

  resize(w: number, h: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.mobile ? 1.6 : 2);
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * dpr * 0.5, h * dpr * 0.5);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.lines.resize(w * dpr, h * dpr);
    this.space.resize(w * dpr, h * dpr);
    this.grade.uniforms.uRes.value.set(w * dpr, h * dpr);
    this.frame.width = w;
    this.frame.height = h;
    this.frame.dpr = dpr;
    this.frame.pxPerRad = h / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
  }

  /** Display radius limit for zooming in on the focus body. */
  private updateMinZoom() {
    const key = this.atlasCam.focusKey;
    const st = key ? this.bodies.states.get(key) : undefined;
    const def = key ? BODY[key] : undefined;
    // the TRUE radius: up close nothing is enlarged anyway, and the enlarged radius would
    // keep the camera at the distance where the enlargement was computed
    const r = st ? st.rTrue * (def?.eqKm ? def.eqKm / def.radiusKm : 1) : def ? kmToAu(def.radiusKm) : 1e-5;
    const min = Math.log10(Math.max(r * (def?.kind === 'spacecraft' ? 2e6 : 1.12), 1e-9));
    this.atlasCam.minLogD = min;
    if (!this.atlasCam.flying && this.atlasCam.targetLogD < min) this.atlasCam.targetLogD = min;
  }

  scenePos(key: string): V3 | undefined {
    return this.frame.pos.get(key);
  }

  render(dt: number, opts: ViewOptions) {
    const f = this.frame;
    this.time += dt;
    // smooth toggles
    const k = 1 - Math.exp(-dt * (opts.reducedMotion ? 30 : 3.2));
    this.mix.illus += ((opts.illus ? 1 : 0) - this.mix.illus) * k;
    this.mix.orbits += ((opts.orbits ? 1 : 0) - this.mix.orbits) * k;
    this.mix.trails += ((opts.trails ? 1 : 0) - this.mix.trails) * k;
    this.mix.small += ((opts.smallBodies ? 1 : 0) - this.mix.small) * k;

    const ks = 1 - Math.exp(-dt * (opts.reducedMotion ? 30 : 4));
    this.shift.x += (this.shiftTarget.x - this.shift.x) * ks;
    this.shift.y += (this.shiftTarget.y - this.shift.y) * ks;
    if (Math.abs(this.shift.x) > 0.5 || Math.abs(this.shift.y) > 0.5) this.camera.setViewOffset(this.width, this.height, this.shift.x, this.shift.y, this.width, this.height);
    else this.camera.clearViewOffset();

    for (const b of BODIES) {
      const p = this.sim.pos.get(b.key);
      if (p) f.pos.set(b.key, eclToScene(p));
    }
    const sun = f.pos.get('sun')!;
    this.updateMinZoom();
    this.atlasCam.update(dt, this.camera, (key) => f.pos.get(key), sun, opts.reducedMotion);
    f.cam = this.atlasCam.cam;
    f.focus = this.atlasCam.focus;
    f.logD = Math.min(this.atlasCam.logD, LOGD_MAX);
    f.s = 1 / 10 ** f.logD;
    f.focusKey = this.atlasCam.focusKey;
    f.selectedKey = opts.selected;
    f.days = this.sim.jd - J2000;
    f.time = this.time;
    f.dt = dt;
    f.illus = this.mix.illus;
    f.showOrbits = this.mix.orbits;
    f.showTrails = this.mix.trails;
    f.showSmallBodies = this.mix.small;
    f.showLabels = opts.labels;
    f.galBlend = this.atlasCam.galBlend;
    f.reducedMotion = opts.reducedMotion;
    this.camera.updateMatrixWorld();

    this.bodies.update(f);
    this.lines.update(f);
    this.space.update(f);
    this.grade.uniforms.uTime.value = this.time % 100;
    this.composer.render(dt);
  }

  /** The body under a screen point (CSS px), with a generous touch radius. */
  pick(x: number, y: number, touch = false): string | null {
    let best: string | null = null;
    let bestScore = Infinity;
    for (const st of this.bodies.states.values()) {
      if (!st.onScreen || st.merged) continue;
      const d = Math.hypot(st.sx - x, st.sy - y);
      const r = Math.max(st.px, touch ? 22 : 13);
      if (d > r) continue;
      const score = d / r + (st.def.kind === 'moon' ? 0.15 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = st.key;
      }
    }
    return best;
  }
}
