/**
 * Planets, moons, the Sun and their rings, atmospheres and cutaways.
 *
 * Size policy (the heart of "true scale vs illustrative"):
 *  - true scale: every body is drawn at its real radius. Sub-pixel bodies get a marker
 *    in the label layer.
 *  - illustrative: a body is enlarged just enough to cover a minimum number of pixels,
 *    never more, and the factor is reported (labels show "×2,270"). As you approach a
 *    body it reaches true size on its own — zooming in never makes anything shrink.
 */
import {
  AdditiveBlending,
  BackSide,
  DataTexture,
  DoubleSide,
  Group,
  Matrix3,
  Matrix4,
  Mesh,
  PlaneGeometry,
  RGBAFormat,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  LinearFilter,
  type Scene,
  type Texture,
  type PerspectiveCamera,
  Color,
} from 'three';
import { BODIES, type BodyDef } from '../data/bodies';
import { INTERIORS, type Interior } from '../data/interiors';
import { RINGS, type RingSystem } from '../data/rings';
import { kmToAu, clamp, smoothstep } from '../core/units';
import { eclToScene, type V3 } from '../physics/frames';
import type { Orientation } from '../physics/rotation';
import { toRender, type Frame } from './frame';
import { loadTexture } from './textures';
import { PLANET_FRAG, PLANET_VERT } from './shaders/planet';
import { ATMO_FRAG, ATMO_VERT, CUT_FRAG, CUT_VERT, GLOW_FRAG, GLOW_VERT, RING_FRAG, RING_VERT, SUN_FRAG, SUN_VERT, TAIL_FRAG, TAIL_VERT } from './shaders/bodies';

export interface BodyState {
  key: string;
  def: BodyDef;
  /** scene axes, AU */
  pos: V3;
  /** camera distance, AU */
  dist: number;
  rTrue: number;
  rDisp: number;
  enlarge: number;
  /** displayed radius in px */
  px: number;
  /** screen position in CSS px; z > 1 → behind the camera */
  sx: number;
  sy: number;
  onScreen: boolean;
  /** moon too close to its planet to separate at this zoom */
  merged: boolean;
}

const MIN_PX: Record<BodyDef['kind'], number> = { star: 7, planet: 3.4, dwarf: 2.4, moon: 2.2, comet: 1.4, spacecraft: 0 };
const MAX_ENLARGE: Record<BodyDef['kind'], number> = { star: 45, planet: 6000, dwarf: 30000, moon: 30000, comet: 2e6, spacecraft: 1 };
const sphereHi = new SphereGeometry(1, 160, 96);
const sphereLo = new SphereGeometry(1, 64, 40);

const tmp = new Vector3();
const tmp2 = new Vector3();

function ringTexture(sys: RingSystem, innerKm: number, outerKm: number): DataTexture {
  const W = 2048;
  const data = new Uint8Array(W * 4);
  for (let i = 0; i < W; i++) {
    const r = innerKm + ((i + 0.5) / W) * (outerKm - innerKm);
    let rgb: [number, number, number] = [0, 0, 0];
    let a = 0;
    for (const b of sys.bands) {
      if (r < b.innerKm || r > b.outerKm) continue;
      // opacity from optical depth (slant path ignored), plus illustrative ringlets
      const x = (r - b.innerKm) / (b.outerKm - b.innerKm);
      const ripple = b.grain > 0 ? 1 + b.grain * 0.5 * (Math.sin(r * 0.011) * 0.6 + Math.sin(r * 0.0037 + 1.3) * 0.4) * (0.6 + 0.4 * Math.sin(x * 40)) : 1;
      const op = 1 - Math.exp(-b.tau * ripple * 1.4);
      const edge = smoothstep(0, 0.004, x) * smoothstep(0, 0.004, 1 - x);
      a = Math.max(a, op * edge);
      rgb = b.color;
    }
    const k = sys.brightness;
    data[i * 4] = Math.round(rgb[0] * 255 * k);
    data[i * 4 + 1] = Math.round(rgb[1] * 255 * k);
    data[i * 4 + 2] = Math.round(rgb[2] * 255 * k);
    data[i * 4 + 3] = Math.round(clamp(a, 0, 1) * 255);
  }
  const t = new DataTexture(data, W, 1, RGBAFormat);
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

const BLANK = (() => {
  const t = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, RGBAFormat);
  t.needsUpdate = true;
  return t;
})();

class BodyView {
  readonly group = new Group();
  readonly mesh: Mesh;
  readonly mat: ShaderMaterial;
  atmo?: Mesh;
  atmoMat?: ShaderMaterial;
  rings?: Mesh;
  ringMat?: ShaderMaterial;
  ringOuterKm = 0;
  ringInnerKm = 0;
  glow?: Mesh;
  glowMat?: ShaderMaterial;
  cutFaces: Mesh[] = [];
  tails: { mesh: Mesh; mat: ShaderMaterial }[] = [];
  cutMat?: ShaderMaterial;
  interior?: Interior;
  hiResRequested = false;
  loRequested = false;
  /** cutaway animation state */
  cutOpen = 0;
  cutTarget = 0;
  cutA = new Vector3(1, 0, 0);
  /** the wedge is aimed at the viewer once per opening, independent of frame rate */
  cutAimed = false;
  altMix = 0;
  altTarget = 0;
  highlight = 0;

  constructor(readonly def: BodyDef) {
    this.group.matrixAutoUpdate = false;
    const isSun = def.kind === 'star';
    if (isSun) {
      this.mat = new ShaderMaterial({
        vertexShader: SUN_VERT,
        fragmentShader: SUN_FRAG,
        uniforms: { uTime: { value: 0 }, uCut: { value: 0 }, uCutAxis: { value: new Vector3() }, uCutA: { value: new Vector3() }, uCutAngle: { value: 0 }, uCenter: { value: new Vector3() }, uIntensity: { value: 3 } },
      });
      this.glowMat = new ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        uniforms: { uCenterR: { value: new Vector3() }, uSize: { value: 1 }, uIntensity: { value: 1 }, uCore: { value: 0.1 }, uTime: { value: 0 } },
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
      });
      this.glow = new Mesh(new PlaneGeometry(2, 2), this.glowMat);
      this.glow.frustumCulled = false;
      this.glow.renderOrder = 5;
    } else {
      this.mat = new ShaderMaterial({
        vertexShader: PLANET_VERT,
        fragmentShader: PLANET_FRAG,
        uniforms: {
          uDay: { value: BLANK },
          uNight: { value: BLANK },
          uClouds: { value: BLANK },
          uOcean: { value: BLANK },
          uAlt: { value: BLANK },
          uRingTex: { value: BLANK },
          uHasDay: { value: 0 },
          uHasNight: { value: 0 },
          uHasClouds: { value: 0 },
          uHasOcean: { value: 0 },
          uAltMix: { value: 0 },
          uZonal: { value: def.texture?.sizes[0] === 'zonal' ? 1 : 0 },
          uLon0: { value: (def.texture?.lon0 ?? -180) / 360 },
          uProc: { value: def.procedural === 'venus-clouds' ? 1 : def.procedural === 'rock' ? 2 : 0 },
          uBase: { value: new Color(def.procedural === 'venus-clouds' ? '#e8d6ad' : def.ink).convertSRGBToLinear() },
          uSunPos: { value: new Vector3() },
          uCenter: { value: new Vector3() },
          uRadius: { value: 1 },
          uTime: { value: 0 },
          uAtmo: { value: new Vector3(...(def.atmosphere?.color ?? [0, 0, 0])) },
          uAtmoStrength: { value: def.atmosphere ? def.atmosphere.strength * 0.5 : 0 },
          uLimb: { value: ['jupiter', 'saturn', 'uranus', 'neptune'].includes(def.key) ? 1 : 0 },
          uHasRings: { value: 0 },
          uRingNormal: { value: new Vector3() },
          uRingRadii: { value: new Vector3() },
          uCut: { value: 0 },
          uCutAxis: { value: new Vector3() },
          uCutA: { value: new Vector3() },
          uCutAngle: { value: 0 },
          uHighlight: { value: 0 },
          uExposure: { value: 1 },
          uInvRot: { value: new Matrix3() },
        },
      });
      if (def.atmosphere) {
        this.atmoMat = new ShaderMaterial({
          vertexShader: ATMO_VERT,
          fragmentShader: ATMO_FRAG,
          uniforms: {
            uColor: { value: new Vector3(...def.atmosphere.color) },
            uStrength: { value: def.atmosphere.strength },
            uSunPos: { value: new Vector3() },
            uCenter: { value: new Vector3() },
            uInner: { value: 0.95 },
            uCut: { value: 0 },
            uCutAxis: { value: new Vector3() },
            uCutA: { value: new Vector3() },
            uCutAngle: { value: 0 },
          },
          side: BackSide,
          blending: AdditiveBlending,
          transparent: true,
          depthWrite: false,
        });
        this.atmo = new Mesh(sphereLo, this.atmoMat);
        this.atmo.matrixAutoUpdate = false;
        this.atmo.frustumCulled = false;
        this.atmo.renderOrder = 3;
      }
      const rs = RINGS[def.key];
      if (rs) {
        this.ringInnerKm = Math.min(...rs.bands.map((b) => b.innerKm));
        this.ringOuterKm = Math.max(...rs.bands.map((b) => b.outerKm));
        const tex = ringTexture(rs, this.ringInnerKm, this.ringOuterKm);
        const innerFrac = this.ringInnerKm / this.ringOuterKm;
        this.ringMat = new ShaderMaterial({
          vertexShader: RING_VERT,
          fragmentShader: RING_FRAG,
          uniforms: {
            uTex: { value: tex },
            uInnerFrac: { value: innerFrac },
            uSunPos: { value: new Vector3() },
            uCenter: { value: new Vector3() },
            uPlanetR: { value: 1 },
            uNormal: { value: new Vector3() },
            uBright: { value: 1.0 },
            uExposure: { value: 1 },
          },
          side: DoubleSide,
          transparent: true,
          depthWrite: false,
        });
        this.rings = new Mesh(new RingGeometry(innerFrac * 0.98, 1.0, 512, 1), this.ringMat);
        this.rings.matrixAutoUpdate = false;
        this.rings.frustumCulled = false;
        this.rings.renderOrder = 2;
        this.mat.uniforms.uRingTex.value = tex;
        this.mat.uniforms.uHasRings.value = def.key === 'saturn' ? 1 : 0;
      }
    }
    this.mesh = new Mesh(def.kind === 'planet' || isSun ? sphereHi : sphereLo, this.mat);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;

    this.interior = INTERIORS[def.key];
    if (this.interior) {
      const layers = this.interior.layers;
      const R = def.radiusKm;
      const radii = new Array(6).fill(1);
      const cols = new Array(6).fill(0).map(() => new Vector3());
      layers.forEach((l, i) => {
        radii[i] = l.outerKm / R;
        const c = new Color(l.color).convertSRGBToLinear();
        cols[i].set(c.r, c.g, c.b);
      });
      this.cutMat = new ShaderMaterial({
        vertexShader: CUT_VERT,
        fragmentShader: CUT_FRAG,
        uniforms: {
          uRadii: { value: radii },
          uColors: { value: cols },
          uPhase: { value: [0, 1, 2, 3, 4, 5].map((i) => ['solid', 'liquid', 'partial', 'fluid', 'plasma', 'gas'].indexOf(layers[i]?.phase ?? 'solid')) },
          uCount: { value: layers.length },
          uOpen: { value: 0 },
          uSunPos: { value: new Vector3() },
          uNormal: { value: new Vector3() },
          uExposure: { value: 1 },
          uHover: { value: -1 },
        },
        side: DoubleSide,
      });
      // half-disc: x ∈ [0,1] outward along the cut, y ∈ [−1,1] along the spin axis
      const g = new PlaneGeometry(1, 2, 1, 1);
      g.translate(0.5, 0, 0);
      for (let i = 0; i < 2; i++) {
        const m = new Mesh(g, this.cutMat);
        m.matrixAutoUpdate = false;
        m.frustumCulled = false;
        m.visible = false;
        this.cutFaces.push(m);
      }
    }
    if (def.kind === 'comet') {
      const g = new PlaneGeometry(1, 2, 48, 6);
      g.translate(0.5, 0, 0);
      for (const curve of [0, 1]) {
        const mat = new ShaderMaterial({
          vertexShader: TAIL_VERT,
          fragmentShader: TAIL_FRAG,
          uniforms: { uHead: { value: new Vector3() }, uAxis: { value: new Vector3() }, uLag: { value: new Vector3() }, uLength: { value: 0 }, uCurve: { value: curve }, uIntensity: { value: 0 } },
          blending: AdditiveBlending,
          depthWrite: false,
          transparent: true,
          side: DoubleSide,
        });
        const mesh = new Mesh(g, mat);
        mesh.frustumCulled = false;
        mesh.renderOrder = 4;
        this.tails.push({ mesh, mat });
        this.group.add(mesh);
      }
    }
    this.group.add(this.mesh);
    if (this.atmo) this.group.add(this.atmo);
    if (this.rings) this.group.add(this.rings);
    if (this.glow) this.group.add(this.glow);
    this.cutFaces.forEach((m) => this.group.add(m));
  }

  /** Request textures (2k on first sight, 4k when focused on a large screen). */
  ensureTextures(hi: boolean) {
    const def = this.def;
    const tex = def.texture;
    if (!tex) {
      if (def.altTexture && !this.loRequested) {
        this.loRequested = true;
        loadTexture(`${def.altTexture.base}.webp`).then((t) => (this.mat.uniforms.uAlt.value = t));
      }
      return;
    }
    const setDay = (t: Texture) => {
      this.mat.uniforms.uDay.value = t;
      this.mat.uniforms.uHasDay.value = 1;
    };
    if (!this.loRequested) {
      this.loRequested = true;
      const first = tex.sizes.includes('2k') ? '2k' : tex.sizes[0];
      loadTexture(`${tex.base}_${first}.webp`).then(setDay);
      if (def.night) loadTexture(`${def.night}_2k.webp`).then((t) => ((this.mat.uniforms.uNight.value = t), (this.mat.uniforms.uHasNight.value = 1)));
      if (def.clouds) loadTexture(`${def.clouds}.webp`, 'data').then((t) => ((this.mat.uniforms.uClouds.value = t), (this.mat.uniforms.uHasClouds.value = 1)));
      if (def.ocean) loadTexture(`${def.ocean}.webp`, 'data').then((t) => ((this.mat.uniforms.uOcean.value = t), (this.mat.uniforms.uHasOcean.value = 1)));
      if (def.altTexture) loadTexture(`${def.altTexture.base}.webp`).then((t) => (this.mat.uniforms.uAlt.value = t));
    }
    if (hi && !this.hiResRequested && tex.sizes.includes('4k')) {
      this.hiResRequested = true;
      loadTexture(`${tex.base}_4k.webp`).then(setDay);
      if (def.night) loadTexture(`${def.night}_4k.webp`).then((t) => (this.mat.uniforms.uNight.value = t));
    }
  }
}

export interface CutawayInfo {
  key: string;
  open: number;
  /** render-space centre, axis and the two face directions */
  center: Vector3;
  axis: Vector3;
  faceA: Vector3;
  faceB: Vector3;
  radius: number;
  interior: Interior;
}

export class BodiesLayer {
  readonly views = new Map<string, BodyView>();
  readonly states = new Map<string, BodyState>();
  private sunRender = new Vector3();
  private basis = new Matrix4();
  private camera: PerspectiveCamera;
  cutaway: CutawayInfo | null = null;
  hiResAllowed = true;

  constructor(scene: Scene, camera: PerspectiveCamera) {
    this.camera = camera;
    for (const def of BODIES) {
      if (def.kind === 'spacecraft') continue;
      const v = new BodyView(def);
      this.views.set(def.key, v);
      scene.add(v.group);
    }
  }

  view(key: string) {
    return this.views.get(key);
  }

  hasInterior(key: string) {
    return !!INTERIORS[key];
  }

  setCutaway(key: string | null) {
    for (const [k, v] of this.views) v.cutTarget = k === key ? 1 : 0;
  }

  setAltLayer(key: string, on: boolean) {
    const v = this.views.get(key);
    if (v) v.altTarget = on ? 1 : 0;
  }

  /** Compute positions, sizes and screen coordinates of every body. */
  computeStates(f: Frame) {
    const { pxPerRad } = f;
    for (const def of BODIES) {
      const pos = f.pos.get(def.key);
      if (!pos) continue;
      const dist = Math.max(1e-12, Math.hypot(pos[0] - f.cam[0], pos[1] - f.cam[1], pos[2] - f.cam[2]));
      const rTrue = kmToAu(def.radiusKm);
      const minR = (MIN_PX[def.kind] / pxPerRad) * dist;
      const rIll = Math.min(Math.max(rTrue, minR), rTrue * MAX_ENLARGE[def.kind]);
      const rDisp = rTrue * (rIll / rTrue) ** f.illus;
      toRender(f, pos, tmp).project(this.camera);
      const onScreen = tmp.z < 1 && Math.abs(tmp.x) < 1.2 && Math.abs(tmp.y) < 1.2;
      const st: BodyState = {
        key: def.key,
        def,
        pos,
        dist,
        rTrue,
        rDisp,
        enlarge: rDisp / rTrue,
        px: (rDisp / dist) * pxPerRad,
        sx: (tmp.x * 0.5 + 0.5) * f.width,
        sy: (-tmp.y * 0.5 + 0.5) * f.height,
        onScreen,
        merged: false,
      };
      this.states.set(def.key, st);
    }
    // moons that sit inside their (possibly enlarged) planet's disc merge into it
    for (const st of this.states.values()) {
      const parent = st.def.parent ? this.states.get(st.def.parent) : undefined;
      if (!parent) continue;
      const sep = Math.hypot(st.sx - parent.sx, st.sy - parent.sy);
      st.merged = sep < parent.px + st.px + 5;
    }
  }

  update(f: Frame) {
    this.computeStates(f);
    const sun = f.pos.get('sun')!;
    toRender(f, sun, this.sunRender);
    const big = Math.min(f.width, f.height) > 700 && this.hiResAllowed;
    this.cutaway = null;
    for (const [key, v] of this.views) {
      const st = this.states.get(key);
      if (!st) {
        v.group.visible = false;
        continue;
      }
      // cutaway & alt-layer animation
      const speed = f.reducedMotion ? 10 : 1.6;
      v.cutOpen += (v.cutTarget - v.cutOpen) * (1 - Math.exp(-f.dt * speed * 2));
      if (Math.abs(v.cutTarget - v.cutOpen) < 1e-3) v.cutOpen = v.cutTarget;
      v.altMix += (v.altTarget - v.altMix) * (1 - Math.exp(-f.dt * 4));
      v.highlight += ((f.selectedKey === key ? 1 : 0) - v.highlight) * (1 - Math.exp(-f.dt * 5));

      if (v.tails.length) {
        // tail length ∝ 1/r² (sunlight drives the activity), only inside ~4 AU
        const sunP = f.pos.get('sun')!;
        const ax = new Vector3(st.pos[0] - sunP[0], st.pos[1] - sunP[1], st.pos[2] - sunP[2]);
        const rAu = ax.length();
        ax.normalize();
        const vel = f.sim.vel.get(key);
        const velS = vel ? new Vector3(vel[0], vel[2], -vel[1]).normalize().negate() : new Vector3();
        const len = Math.min(0.6, 0.11 / (rAu * rAu)) * f.s;
        const on = (1 - smoothstep(2.5, 4.2, rAu)) * f.showOrbits;
        const head = toRender(f, st.pos, new Vector3());
        for (const t of v.tails) {
          t.mat.uniforms.uHead.value.copy(head);
          t.mat.uniforms.uAxis.value.copy(ax);
          t.mat.uniforms.uLag.value.copy(velS);
          t.mat.uniforms.uLength.value = len;
          t.mat.uniforms.uIntensity.value = 0.9 * on;
          t.mesh.visible = on > 0.01;
        }
      }
      const visible = st.px > 0.35 && !st.merged && st.dist > st.rDisp * 1.0001;
      v.mesh.visible = visible;
      if (v.atmo) v.atmo.visible = visible;
      if (v.rings) v.rings.visible = visible;
      if (v.glow) v.glow.visible = visible;
      v.group.visible = visible || v.tails.some((t) => t.mesh.visible);
      if (!visible) continue;
      v.ensureTextures(big && (f.focusKey === key || f.selectedKey === key) && st.px > 120);

      const r = st.rDisp * f.s;
      const c = toRender(f, st.pos, tmp2).clone();
      const o: Orientation | null = f.sim.orientation(key);
      const X = new Vector3(...(o?.prime ?? [1, 0, 0]));
      const Y = new Vector3(...(o?.pole ?? [0, 1, 0]));
      const Z = new Vector3().crossVectors(X, Y);
      const flat = v.def.polarKm && v.def.eqKm ? v.def.polarKm / v.def.eqKm : 1;
      const eqScale = v.def.eqKm ? v.def.eqKm / v.def.radiusKm : 1;
      this.basis.makeBasis(X.clone().multiplyScalar(r * eqScale), Y.clone().multiplyScalar(r * eqScale * flat), Z.clone().multiplyScalar(r * eqScale));
      this.basis.setPosition(c);
      v.mesh.matrix.copy(this.basis);
      v.mesh.matrixWorldNeedsUpdate = true;
      v.group.matrixWorld.identity();

      // cutaway geometry (shared by planet shader, atmosphere and faces)
      const cutAngle = (Math.PI / 2) * v.cutOpen;
      const cutting = v.cutOpen > 0.001 && !!v.interior;
      if (v.cutTarget === 0 && v.cutOpen === 0) v.cutAimed = false;
      if (v.cutTarget > 0 && !v.cutAimed) {
        // aim the wedge at the viewer when it starts opening
        const toCam = c.clone().multiplyScalar(-1).normalize();
        const q = toCam.clone().sub(Y.clone().multiplyScalar(toCam.dot(Y))).normalize();
        v.cutA.copy(q.applyAxisAngle(Y, -Math.PI / 4));
        v.cutAimed = true;
      }
      // keep the knife exactly perpendicular to the spin axis
      v.cutA.sub(Y.clone().multiplyScalar(v.cutA.dot(Y))).normalize();
      const faceB = v.cutA.clone().applyAxisAngle(Y, cutAngle);

      const u = v.mat.uniforms;
      if (v.def.kind === 'star') {
        u.uTime.value = f.time;
        u.uCut.value = cutting ? 1 : 0;
        u.uCutAxis.value.copy(Y);
        u.uCutA.value.copy(v.cutA);
        u.uCutAngle.value = cutAngle;
        u.uCenter.value.copy(c);
        // like an eye adapting: a small, distant Sun is a blazing point; up close the
        // photosphere is exposed down so granulation and limb darkening stay readable
        const near = smoothstep(12, 160, st.px);
        u.uIntensity.value = 3.0 - 1.9 * near;
        const g = v.glowMat!.uniforms;
        const sizePx = st.px < 20 ? Math.max(st.px * 5, 46) : st.px * (2.6 - 0.9 * near);
        const size = (sizePx / f.pxPerRad) * st.dist * f.s;
        g.uCenterR.value.copy(c);
        g.uSize.value = size;
        g.uCore.value = clamp(st.px / sizePx, 0.01, 0.6);
        g.uIntensity.value = (0.75 - 0.4 * near) * (1 - smoothstep(4.8, 6.3, Math.log10(st.dist)) * 0.7);
        g.uTime.value = f.time;
      } else {
        u.uSunPos.value.copy(this.sunRender);
        u.uCenter.value.copy(c);
        u.uRadius.value = r;
        u.uTime.value = f.days;
        u.uAltMix.value = v.altMix;
        u.uHighlight.value = v.highlight * (st.px > 6 ? 1 : 0);
        u.uInvRot.value.setFromMatrix4(new Matrix4().makeBasis(X, Y, Z)).transpose();
        u.uCut.value = cutting ? 1 : 0;
        u.uCutAxis.value.copy(Y);
        u.uCutA.value.copy(v.cutA);
        u.uCutAngle.value = cutAngle;
      }

      if (v.atmo && v.atmoMat) {
        const h = Math.max((v.def.atmosphere!.heightKm / v.def.radiusKm) * 1.0, 0.025);
        const shell = 1 + h;
        const m = this.basis.clone();
        m.scale(new Vector3(shell, shell, shell));
        v.atmo.matrix.copy(m);
        const a = v.atmoMat.uniforms;
        a.uSunPos.value.copy(this.sunRender);
        a.uCenter.value.copy(c);
        a.uInner.value = 1 / shell;
        a.uCut.value = cutting ? 1 : 0;
        a.uCutAxis.value.copy(Y);
        a.uCutA.value.copy(v.cutA);
        a.uCutAngle.value = cutAngle;
        v.atmo.visible = st.px > 2.5;
      }
      if (v.rings && v.ringMat) {
        const k = st.rDisp / st.rTrue;
        const outer = kmToAu(v.ringOuterKm) * k * f.s;
        const m = new Matrix4().makeBasis(X.clone().multiplyScalar(outer), Z.clone().multiplyScalar(-outer), Y.clone().multiplyScalar(outer));
        m.setPosition(c);
        v.rings.matrix.copy(m);
        const rg = v.ringMat.uniforms;
        rg.uSunPos.value.copy(this.sunRender);
        rg.uCenter.value.copy(c);
        rg.uPlanetR.value = r * (v.def.eqKm ? v.def.eqKm / v.def.radiusKm : 1);
        rg.uNormal.value.copy(Y);
        v.rings.visible = st.px > 1.5;
        u.uRingNormal.value.copy(Y);
        u.uRingRadii.value.set(kmToAu(v.ringInnerKm) * k * f.s, outer, 0);
      }
      // cut faces
      if (v.cutMat) {
        v.cutFaces.forEach((m, i) => {
          m.visible = cutting;
          if (!cutting) return;
          const dir = i === 0 ? v.cutA : faceB;
          const normal = new Vector3().crossVectors(dir, Y);
          const rr = r * (v.def.eqKm ? v.def.eqKm / v.def.radiusKm : 1);
          const mm = new Matrix4().makeBasis(dir.clone().multiplyScalar(rr), Y.clone().multiplyScalar(rr * flat), normal);
          mm.setPosition(c);
          m.matrix.copy(mm);
        });
        const cu = v.cutMat.uniforms;
        cu.uOpen.value = smoothstep(0.0, 0.85, v.cutOpen);
        cu.uSunPos.value.copy(this.sunRender);
        cu.uNormal.value.copy(new Vector3().crossVectors(v.cutA, Y));
      }
      if (cutting && v.interior) {
        this.cutaway = { key, open: v.cutOpen, center: c.clone(), axis: Y.clone(), faceA: v.cutA.clone(), faceB, radius: r * eqScale, interior: v.interior };
      }
      // the mesh matrices above are local == world (group has identity transform)
      v.mesh.matrixWorld.copy(v.mesh.matrix);
      if (v.atmo) v.atmo.matrixWorld.copy(v.atmo.matrix);
      if (v.rings) v.rings.matrixWorld.copy(v.rings.matrix);
      v.cutFaces.forEach((m) => m.matrixWorld.copy(m.matrix));
    }
  }

  /** Scene-axis helper used by other layers. */
  static scene(p: V3): V3 {
    return eclToScene(p);
  }
}
