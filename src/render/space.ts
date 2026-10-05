/**
 * The layers beyond the planets: the real sky, the Milky Way model, the nearest stars,
 * the heliosphere and Oort cloud, and the small bodies on the GPU.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Matrix4,
  Mesh,
  NormalBlending,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  BackSide,
  type Scene,
} from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { GAL_X, GAL_Y, GAL_Z, radecToScene, type V3 } from '../physics/frames';
import { DEG, LY_AU, PC_AU, smoothstep } from '../core/units';
import { GALAXY } from '../data/galaxy';
import nearby from '../data/generated/nearby-stars.json';
import sbMeta from '../data/generated/small-bodies-meta.json';
import { BAND_FRAG, BAND_VERT, CLOUD_FRAG, CLOUD_VERT, SKY_FRAG, SKY_VERT, SMALL_FRAG, SMALL_VERT } from './shaders/points';
import { toRender, type Frame } from './frame';
import { galacticCentre } from './camera';

const KPC_AU = PC_AU * 1000;

/** Something the label layer should draw this frame. */
export interface Annotation {
  id: string;
  text: string;
  sub?: string;
  /** render-space position */
  at: Vector3;
  kind: 'region' | 'star' | 'ring' | 'here' | 'arm';
  opacity: number;
  priority: number;
}

/** Deterministic random numbers so the galaxy looks the same for everyone. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

/** B−V colour index → linear RGB (Ballesteros 2012 temperature, blackbody approximation). */
export function bvToRgb(bv: number): [number, number, number] {
  const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  const t = T / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * (t - 60) ** -0.1332;
    g = 288.12 * (t - 60) ** -0.0755;
    b = 255;
  }
  const c = new Color(Math.min(255, Math.max(0, r)) / 255, Math.min(255, Math.max(0, g)) / 255, Math.min(255, Math.max(0, b)) / 255);
  c.convertSRGBToLinear();
  return [c.r, c.g, c.b];
}

const SPECTRAL_BV: Record<string, number> = { O: -0.3, B: -0.15, A: 0.05, F: 0.45, G: 0.65, K: 1.05, M: 1.5, L: 2.0 };

function circlePoints(n: number, radius: number, u: V3, v: V3): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([radius * (Math.cos(a) * u[0] + Math.sin(a) * v[0]), radius * (Math.cos(a) * u[1] + Math.sin(a) * v[1]), radius * (Math.cos(a) * u[2] + Math.sin(a) * v[2])]);
  }
  return pts;
}

class Circle {
  readonly geom = new LineGeometry();
  readonly line: Line2;
  private buf: Float32Array;
  constructor(readonly pts: V3[], readonly mat: LineMaterial) {
    this.buf = new Float32Array(pts.length * 3);
    this.geom.setPositions(this.buf);
    this.line = new Line2(this.geom, mat);
    this.line.frustumCulled = false;
    this.line.renderOrder = 4;
  }
  /** centre in scene AU; scale multiplies pts */
  place(f: Frame, centre: V3, visible: boolean) {
    this.line.visible = visible;
    if (!visible) return;
    for (let i = 0; i < this.pts.length; i++) {
      const p = this.pts[i];
      this.buf[i * 3] = (centre[0] + p[0] - f.cam[0]) * f.s;
      this.buf[i * 3 + 1] = (centre[1] + p[1] - f.cam[1]) * f.s;
      this.buf[i * 3 + 2] = (centre[2] + p[2] - f.cam[2]) * f.s;
    }
    this.geom.setPositions(this.buf);
    this.line.computeLineDistances();
  }
}

function lineMat(color: string, width: number, opacity: number, dashed = false) {
  const m = new LineMaterial({ color: new Color(color).getHex(), linewidth: width, transparent: true, opacity, depthWrite: false, blending: AdditiveBlending, worldUnits: false, dashed });
  if (dashed) {
    m.dashSize = 5;
    m.gapSize = 6;
  }
  return m;
}

export class SpaceLayers {
  private sky: Points;
  private skyMat: ShaderMaterial;
  private band: Mesh;
  private bandMat: ShaderMaterial;
  private galaxy: Points;
  private galaxyMat: ShaderMaterial;
  private dust: Points;
  private dustMat: ShaderMaterial;
  private oort: Points;
  private oortMat: ShaderMaterial;
  private stars: Points;
  private starsMat: ShaderMaterial;
  private starPos: V3[] = [];
  private small?: Points;
  private smallMat: ShaderMaterial;
  private rings: { circle: Circle; ly: number }[] = [];
  private helio: { circle: Circle; au: number; key: string }[] = [];
  private galRings: { circle: Circle; kpc: number }[] = [];
  private lineMats: LineMaterial[] = [];
  private m4 = new Matrix4();
  readonly annotations: Annotation[] = [];
  smallCount = sbMeta.total;

  constructor(scene: Scene, mobile: boolean, baseUrl: string) {
    // --- sky ---
    this.skyMat = new ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: { uPx: { value: 1 }, uLimit: { value: 6.5 }, uOpacity: { value: 1 } },
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    this.sky = new Points(new BufferGeometry(), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    fetch(`${baseUrl}data/bsc5.bin`)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        const d = new Float32Array(buf);
        const n = d.length / 5;
        const pos = new Float32Array(n * 3);
        const mag = new Float32Array(n);
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const p = radecToScene(d[i * 5 + 1], d[i * 5 + 2]);
          pos.set(p, i * 3);
          mag[i] = d[i * 5 + 3];
          col.set(bvToRgb(d[i * 5 + 4]), i * 3);
        }
        const g = this.sky.geometry;
        g.setAttribute('position', new BufferAttribute(pos, 3));
        g.setAttribute('aMag', new BufferAttribute(mag, 1));
        g.setAttribute('aColor', new BufferAttribute(col, 3));
      });

    this.bandMat = new ShaderMaterial({
      vertexShader: BAND_VERT,
      fragmentShader: BAND_FRAG,
      uniforms: { uGalX: { value: new Vector3(...GAL_X) }, uGalY: { value: new Vector3(...GAL_Y) }, uGalZ: { value: new Vector3(...GAL_Z) }, uOpacity: { value: 1 } },
      side: BackSide,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    this.band = new Mesh(new SphereGeometry(1, 64, 32), this.bandMat);
    this.band.frustumCulled = false;
    this.band.renderOrder = -11;
    scene.add(this.band);

    // --- Milky Way model (galactocentric kpc; x toward the Sun→GC direction, z = NGP) ---
    const r = rng(20261005);
    const N = mobile ? 70_000 : 170_000;
    const gp: number[] = [], gc: number[] = [], gs: number[] = [];
    const push = (x: number, y: number, z: number, c: [number, number, number], s: number) => {
      gp.push(x, y, z);
      gc.push(c[0], c[1], c[2]);
      gs.push(s);
    };
    const pitch = Math.tan(GALAXY.pitchDeg * DEG);
    // arm radius at galactocentric angle θ (θ = π is the Sun's direction, measured from +x)
    const armR = (r0: number, th: number) => r0 * Math.exp((th - Math.PI) * pitch);
    const armDensity = (x: number, y: number) => {
      const R = Math.hypot(x, y);
      const th = Math.atan2(y, x);
      let best = 0;
      for (const a of GALAXY.arms) {
        for (let k = -3; k <= 3; k++) {
          const rr = armR(a.rAtSunKpc, th + k * 2 * Math.PI);
          const d = Math.abs(R - rr);
          const w = 0.32 + 0.04 * R;
          best = Math.max(best, a.weight * Math.exp(-(d * d) / (w * w)));
        }
      }
      // the Orion Spur near the Sun
      const sp = GALAXY.spur;
      const dth = Math.atan2(Math.sin(th - Math.PI), Math.cos(th - Math.PI)) / DEG;
      if (dth > sp.fromDeg && dth < sp.toDeg) best = Math.max(best, sp.weight * Math.exp(-((R - sp.rKpc) ** 2) / 0.09));
      return best;
    };
    const warm: [number, number, number] = [1.0, 0.74, 0.45];
    const cream: [number, number, number] = [0.95, 0.85, 0.7];
    const blue: [number, number, number] = [0.6, 0.72, 1.0];
    const pink: [number, number, number] = [1.0, 0.36, 0.55];
    let made = 0;
    while (made < N * 0.62) {
      // exponential disc, rejection-weighted toward the arms
      const R = -GALAXY.diskScaleKpc * Math.log(1 - r() * 0.997) + 0.3;
      if (R > GALAXY.diskRadiusKpc) continue;
      const th = r() * Math.PI * 2;
      const x = R * Math.cos(th), y = R * Math.sin(th);
      const arm = armDensity(x, y);
      if (r() > 0.14 + 0.86 * arm) continue;
      const z = gauss(r) * GALAXY.thinDiskHeightKpc * (0.3 + 0.7 * (1 - arm)) * 0.55;
      const young = arm > 0.45 && r() < 0.65;
      const k = (young ? 0.1 : 0.055) + 0.06 * r();
      const c = young ? blue : cream;
      push(x, y, z, [c[0] * k, c[1] * k, c[2] * k], 0.035 + 0.05 * r());
      if (young && r() < 0.014) push(x + gauss(r) * 0.04, y + gauss(r) * 0.04, z, [pink[0] * 0.55, pink[1] * 0.55, pink[2] * 0.55], 0.09 + 0.08 * r());
      made++;
    }
    // diffuse glow: large faint puffs that turn the arms into light rather than dots
    let glow = 0;
    while (glow < (mobile ? 1600 : 4200)) {
      const R = -GALAXY.diskScaleKpc * Math.log(1 - r() * 0.99) + 0.6;
      if (R > 15) continue;
      const th = r() * Math.PI * 2;
      const x = R * Math.cos(th), y = R * Math.sin(th);
      const arm = armDensity(x, y);
      if (r() > 0.08 + 0.92 * arm) continue;
      const k = 0.006 + 0.006 * r();
      const c = arm > 0.5 ? blue : cream;
      push(x, y, gauss(r) * 0.08, [c[0] * k, c[1] * k, c[2] * k], 0.55 + 0.6 * r());
      glow++;
    }
    // bulge and bar
    const barA = (180 - GALAXY.barAngleDeg) * DEG; // near end toward the Sun, at positive longitude
    const cb = Math.cos(barA), sb = Math.sin(barA);
    for (let i = 0; i < N * 0.24; i++) {
      const isBar = r() < 0.55;
      let x: number, y: number, z: number;
      if (isBar) {
        const u = gauss(r) * GALAXY.barHalfLengthKpc * 0.42, v = gauss(r) * 0.55;
        x = u * cb - v * sb;
        y = u * sb + v * cb;
        z = gauss(r) * 0.3;
      } else {
        const rr = Math.abs(gauss(r)) * 1.0;
        const ph = r() * Math.PI * 2, ct = r() * 2 - 1;
        x = rr * Math.sqrt(1 - ct * ct) * Math.cos(ph);
        y = rr * Math.sqrt(1 - ct * ct) * Math.sin(ph);
        z = rr * ct * 0.65;
      }
      const k = 0.012 + 0.02 * r();
      push(x, y, z, [warm[0] * k, warm[1] * k, warm[2] * k], 0.04 + 0.05 * r());
    }
    for (let i = 0; i < (mobile ? 500 : 1300); i++) {
      const rr = Math.abs(gauss(r)) * 1.6;
      const ph = r() * Math.PI * 2;
      const k = 0.0035 + 0.004 * r();
      push(rr * Math.cos(ph), rr * Math.sin(ph) * 0.8, gauss(r) * 0.3, [warm[0] * k, warm[1] * k, warm[2] * k], 0.7 + 0.8 * r());
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(gp), 3));
    geo.setAttribute('aColor', new BufferAttribute(new Float32Array(gc), 3));
    geo.setAttribute('aSize', new BufferAttribute(new Float32Array(gs), 1));
    this.galaxyMat = cloudMat(false);
    this.galaxy = new Points(geo, this.galaxyMat);
    this.galaxy.matrixAutoUpdate = false;
    this.galaxy.frustumCulled = false;
    this.galaxy.renderOrder = 6;
    scene.add(this.galaxy);

    // dust lanes along the inner edges of the arms (absorbing)
    const dp: number[] = [], dc: number[] = [], ds: number[] = [];
    for (let i = 0; i < (mobile ? 6000 : 16000); i++) {
      const a = GALAXY.arms[Math.floor(r() * GALAXY.arms.length)];
      const th = Math.PI + (r() * 2 - 1) * 2.6;
      const R = armR(a.rAtSunKpc, th) - 0.24 + gauss(r) * 0.06;
      if (R < 2.8 || R > 13.5) continue;
      dp.push(R * Math.cos(th), R * Math.sin(th), gauss(r) * 0.03);
      dc.push(0.018, 0.012, 0.012);
      ds.push(0.12 + 0.12 * r());
    }
    const dgeo = new BufferGeometry();
    dgeo.setAttribute('position', new BufferAttribute(new Float32Array(dp), 3));
    dgeo.setAttribute('aColor', new BufferAttribute(new Float32Array(dc), 3));
    dgeo.setAttribute('aSize', new BufferAttribute(new Float32Array(ds), 1));
    this.dustMat = cloudMat(true);
    this.dust = new Points(dgeo, this.dustMat);
    this.dust.matrixAutoUpdate = false;
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 7;
    scene.add(this.dust);

    // --- Oort cloud (hypothetical; drawn as a sparse shell, AU units) ---
    const op: number[] = [], oc: number[] = [], os: number[] = [];
    for (let i = 0; i < (mobile ? 9000 : 22000); i++) {
      const rr = 10 ** (Math.log10(2000) + r() * (Math.log10(100_000) - Math.log10(2000)));
      const ct = rr < 20000 ? gauss(r) * 0.45 : r() * 2 - 1; // inner (Hills) cloud flatter
      const c = Math.max(-1, Math.min(1, ct));
      const ph = r() * Math.PI * 2;
      op.push(rr * Math.sqrt(1 - c * c) * Math.cos(ph), rr * c, rr * Math.sqrt(1 - c * c) * Math.sin(ph));
      const k = 0.18 + 0.1 * r();
      oc.push(0.62 * k, 0.75 * k, 0.95 * k);
      os.push(rr * 0.004);
    }
    const ogeo = new BufferGeometry();
    ogeo.setAttribute('position', new BufferAttribute(new Float32Array(op), 3));
    ogeo.setAttribute('aColor', new BufferAttribute(new Float32Array(oc), 3));
    ogeo.setAttribute('aSize', new BufferAttribute(new Float32Array(os), 1));
    this.oortMat = cloudMat(false);
    this.oort = new Points(ogeo, this.oortMat);
    this.oort.matrixAutoUpdate = false;
    this.oort.frustumCulled = false;
    scene.add(this.oort);

    // --- nearest stars (SIMBAD) ---
    const sp: number[] = [], sc: number[] = [], ss: number[] = [];
    for (const s of nearby.stars) {
      const dir = radecToScene(s.raDeg, s.decDeg);
      const d = s.distanceLy * LY_AU;
      const p: V3 = [dir[0] * d, dir[1] * d, dir[2] * d];
      this.starPos.push(p);
      sp.push(0, 0, 0);
      const bv = SPECTRAL_BV[(s.spType ?? 'G').replace(/^[dsg]/, '')[0]] ?? 0.65;
      const c = bvToRgb(bv);
      const absMag = (s.vmag ?? 10) - 5 * Math.log10(s.distanceLy / 3.2616 / 10);
      const size = Math.min(9, Math.max(2.4, 3.2 + (4.8 - absMag) * 0.45));
      sc.push(c[0] * 2.6, c[1] * 2.6, c[2] * 2.6);
      ss.push(size);
    }
    const sgeo = new BufferGeometry();
    sgeo.setAttribute('position', new BufferAttribute(new Float32Array(sp), 3));
    sgeo.setAttribute('aColor', new BufferAttribute(new Float32Array(sc), 3));
    sgeo.setAttribute('aSize', new BufferAttribute(new Float32Array(ss), 1));
    this.starsMat = cloudMat(false);
    this.starsMat.uniforms.uFixed.value = 1;
    this.stars = new Points(sgeo, this.starsMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = 8;
    scene.add(this.stars);

    // distance rings in the galactic plane around the Sun, and heliosphere boundaries
    const ringMat = lineMat('#ece4d4', 1, 0.28, true);
    const helioMat = lineMat('#9fd0c4', 1.1, 0.5);
    const helioDash = lineMat('#9fd0c4', 1, 0.4, true);
    this.lineMats.push(ringMat, helioMat, helioDash);
    for (const ly of [5, 10, 15, 20]) {
      const c = new Circle(circlePoints(256, ly * LY_AU, GAL_X, GAL_Y), ringMat);
      scene.add(c.line);
      this.rings.push({ circle: c, ly });
    }
    // a graticule on the galactic plane, centred on Sgr A*
    const galMat = lineMat('#ece4d4', 1, 0.16, true);
    this.lineMats.push(galMat);
    for (const kpc of [5, 10, 15]) {
      const c = new Circle(circlePoints(360, kpc * KPC_AU, GAL_X, GAL_Y), galMat);
      scene.add(c.line);
      this.galRings.push({ circle: c, kpc });
    }
    const ex: V3 = [1, 0, 0], ez: V3 = [0, 0, 1];
    for (const [au, key, mat] of [
      [90, 'region.termination', helioDash],
      [121, 'region.heliopause', helioMat],
    ] as const) {
      const c = new Circle(circlePoints(256, au, ex, ez), mat);
      scene.add(c.line);
      this.helio.push({ circle: c, au, key });
    }

    // --- small bodies (JPL SBDB) ---
    this.smallMat = new ShaderMaterial({
      vertexShader: SMALL_VERT,
      fragmentShader: SMALL_FRAG,
      uniforms: {
        uDays: { value: 0 },
        uSunR: { value: new Vector3() },
        uScale: { value: 1 },
        uPx: { value: 1 },
        uOpacity: { value: 1 },
        uColors: { value: ['#d8ccb4', '#ff7a52', '#6fc3ad', '#e7b45a', '#8fa4ff', '#cbbfa8'].map((h) => new Vector3(...new Color(h).convertSRGBToLinear().toArray())) },
        uMask: { value: [0.6, 0.55, 0.85, 0.9, 0.85, 0.5] },
      },
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    fetch(`${baseUrl}data/small-bodies.bin`)
      .then((res) => res.arrayBuffer())
      .then((buf) => {
        const d = new Float32Array(buf);
        const n = d.length / 8;
        const e0 = new Float32Array(n * 4), e1 = new Float32Array(n * 4);
        const classes = sbMeta.classes;
        const group = (c: string) => (['APO', 'ATE', 'AMO', 'IEO'].includes(c) ? 1 : c === 'TJN' ? 2 : c === 'CEN' ? 3 : ['TNO', 'PAA', 'HYA'].includes(c) ? 4 : 0);
        for (let i = 0; i < n; i++) {
          const o = i * 8;
          e0.set([d[o], d[o + 1], d[o + 2] * DEG, d[o + 3] * DEG], i * 4);
          e1.set([d[o + 4] * DEG, d[o + 5] * DEG, d[o + 6], group(classes[d[o + 7]] ?? 'MBA')], i * 4);
        }
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
        g.setAttribute('aEl0', new BufferAttribute(e0, 4));
        g.setAttribute('aEl1', new BufferAttribute(e1, 4));
        this.small = new Points(g, this.smallMat);
        this.small.frustumCulled = false;
        this.small.renderOrder = 3;
        scene.add(this.small);
        this.smallCount = n;
      });
  }

  resize(w: number, h: number) {
    this.lineMats.forEach((m) => m.resolution.set(w, h));
  }

  update(f: Frame) {
    this.annotations.length = 0;
    const sun = f.pos.get('sun')!;
    const sunDist = Math.max(1e-9, Math.hypot(sun[0] - f.cam[0], sun[1] - f.cam[1], sun[2] - f.cam[2]));
    const L = Math.log10(sunDist);
    const at = (p: V3) => toRender(f, p, new Vector3());

    // sky from the Sun's vantage point: fades once we leave the solar neighbourhood
    const skyO = 1 - smoothstep(4.6, 6.2, L);
    this.skyMat.uniforms.uOpacity.value = skyO;
    this.skyMat.uniforms.uPx.value = f.dpr;
    this.sky.visible = skyO > 0.01;
    this.bandMat.uniforms.uOpacity.value = skyO;
    this.band.visible = skyO > 0.01;

    // galaxy
    const gcp = galacticCentre(sun);
    const gO = smoothstep(7.0, 8.4, f.logD);
    const s = KPC_AU * f.s;
    const gpos = toRender(f, gcp, new Vector3());
    this.m4.makeBasis(new Vector3(...GAL_X).multiplyScalar(s), new Vector3(...GAL_Y).multiplyScalar(s), new Vector3(...GAL_Z).multiplyScalar(s));
    this.m4.setPosition(gpos);
    for (const [obj, mat] of [
      [this.galaxy, this.galaxyMat],
      [this.dust, this.dustMat],
    ] as const) {
      obj.visible = gO > 0.01;
      obj.matrix.copy(this.m4);
      obj.matrixWorld.copy(this.m4);
      mat.uniforms.uOpacity.value = gO;
      mat.uniforms.uPx.value = f.dpr;
      mat.uniforms.uSizeScale.value = s * f.pxPerRad;
    }
    for (const g of this.galRings) {
      g.circle.place(f, gcp, gO > 0.02);
      if (gO > 0.05) {
        const p: V3 = [gcp[0] - GAL_Y[0] * g.kpc * KPC_AU, gcp[1] - GAL_Y[1] * g.kpc * KPC_AU, gcp[2] - GAL_Y[2] * g.kpc * KPC_AU];
        this.annotations.push({ id: `gal-${g.kpc}`, text: 'region.lightyear', sub: String(Math.round((g.kpc * 3261.56) / 100) * 100), at: at(p), kind: 'ring', opacity: gO * 0.8, priority: 2 });
      }
    }
    if (gO > 0.05) {
      const here = at(sun);
      this.annotations.push({ id: 'here', text: 'region.youarehere', at: here, kind: 'here', opacity: gO, priority: 10 });
      this.annotations.push({ id: 'gc', text: 'region.gc', at: gpos.clone(), kind: 'region', opacity: gO, priority: 8 });
      const pitch = Math.tan(GALAXY.pitchDeg * DEG);
      for (const a of GALAXY.arms) {
        const th = Math.PI - 0.9;
        const R = a.rAtSunKpc * Math.exp((th - Math.PI) * pitch);
        const local = new Vector3(R * Math.cos(th), R * Math.sin(th), 0).applyMatrix4(this.m4);
        this.annotations.push({ id: a.key, text: a.key, at: local, kind: 'arm', opacity: gO * 0.85, priority: 4 });
      }
    }

    // nearest stars
    const nO = smoothstep(4.2, 5.2, L) * (1 - smoothstep(7.6, 8.4, f.logD));
    this.stars.visible = nO > 0.01;
    if (this.stars.visible) {
      const pa = this.stars.geometry.getAttribute('position') as BufferAttribute;
      const arr = pa.array as Float32Array;
      this.starPos.forEach((p, i) => {
        arr[i * 3] = (sun[0] + p[0] - f.cam[0]) * f.s;
        arr[i * 3 + 1] = (sun[1] + p[1] - f.cam[1]) * f.s;
        arr[i * 3 + 2] = (sun[2] + p[2] - f.cam[2]) * f.s;
      });
      pa.needsUpdate = true;
      this.starsMat.uniforms.uOpacity.value = nO;
      this.starsMat.uniforms.uPx.value = f.dpr;
      nearby.stars.forEach((st, i) => {
        if (i > 26 && st.distanceLy > 20 && !['Vega', 'Arcturus', 'Altair', 'Fomalhaut', 'TRAPPIST-1'].includes(st.label)) return;
        const p = this.starPos[i];
        this.annotations.push({
          id: `star-${i}`,
          text: st.label,
          sub: `${st.distanceLy.toFixed(1)}`,
          at: at([sun[0] + p[0], sun[1] + p[1], sun[2] + p[2]]),
          kind: 'star',
          opacity: nO,
          priority: st.distanceLy < 9 ? 6 : 3,
        });
      });
    }
    for (const r of this.rings) {
      const o = nO * 0.9;
      r.circle.place(f, sun, o > 0.02);
      (r.circle.mat as LineMaterial).opacity = 0.3 * o;
      if (o > 0.05) {
        const p: V3 = [sun[0] + GAL_X[0] * r.ly * LY_AU, sun[1] + GAL_X[1] * r.ly * LY_AU, sun[2] + GAL_X[2] * r.ly * LY_AU];
        this.annotations.push({ id: `ring-${r.ly}`, text: 'region.lightyear', sub: String(r.ly), at: at(p), kind: 'ring', opacity: o, priority: 2 });
      }
    }

    // heliosphere and Oort cloud
    const hO = smoothstep(1.4, 2.0, f.logD) * (1 - smoothstep(3.6, 4.4, L));
    for (const h of this.helio) {
      h.circle.place(f, sun, hO > 0.02);
      if (hO > 0.05) this.annotations.push({ id: h.key, text: h.key, at: at([sun[0] + h.au * 0.7071, sun[1], sun[2] + h.au * 0.7071]), kind: 'ring', opacity: hO, priority: 5 });
    }
    const oO = smoothstep(2.9, 3.7, L) * (1 - smoothstep(5.4, 6.2, L));
    this.oort.visible = oO > 0.01;
    if (this.oort.visible) {
      const m = new Matrix4().makeScale(f.s, f.s, f.s).setPosition(at(sun));
      this.oort.matrix.copy(m);
      this.oort.matrixWorld.copy(m);
      this.oortMat.uniforms.uOpacity.value = oO * 0.9;
      this.oortMat.uniforms.uPx.value = f.dpr;
      this.oortMat.uniforms.uSizeScale.value = f.s * f.pxPerRad;
      this.annotations.push({ id: 'oort', text: 'region.oort', at: at([sun[0] + 30000, sun[1] + 12000, sun[2]]), kind: 'region', opacity: oO, priority: 6 });
    }

    // small bodies
    if (this.small) {
      const o = f.showSmallBodies * smoothstep(-0.6, 0.2, L) * (1 - smoothstep(3.4, 4.3, L));
      this.small.visible = o > 0.01;
      const u = this.smallMat.uniforms;
      u.uDays.value = f.days;
      u.uSunR.value.copy(at(sun));
      u.uScale.value = f.s;
      u.uPx.value = f.dpr;
      u.uOpacity.value = o;
      if (o > 0.1) {
        const jup = f.pos.get('jupiter')!;
        const jr: V3 = [jup[0] - sun[0], jup[1] - sun[1], jup[2] - sun[2]];
        const rot = (v: V3, ang: number): V3 => [v[0] * Math.cos(ang) + v[2] * Math.sin(ang), v[1], -v[0] * Math.sin(ang) + v[2] * Math.cos(ang)];
        const l4 = rot(jr, -Math.PI / 3);
        this.annotations.push({ id: 'trojans', text: 'region.trojans', at: at([sun[0] + l4[0], sun[1] + l4[1], sun[2] + l4[2]]), kind: 'region', opacity: o, priority: 3 });
        this.annotations.push({ id: 'mainbelt', text: 'region.mainbelt', at: at([sun[0] - 2.75, sun[1], sun[2] + 0.4]), kind: 'region', opacity: o * (1 - smoothstep(1.6, 2.4, L)), priority: 3 });
        this.annotations.push({ id: 'kuiper', text: 'region.kuiper', at: at([sun[0] + 44, sun[1], sun[2] - 12]), kind: 'region', opacity: o * smoothstep(1.2, 1.7, L), priority: 3 });
      }
    }
  }
}

function cloudMat(dark: boolean) {
  return new ShaderMaterial({
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    uniforms: { uPx: { value: 1 }, uSizeScale: { value: 1 }, uOpacity: { value: 1 }, uMinPx: { value: 1.1 }, uDark: { value: dark ? 1 : 0 }, uFixed: { value: 0 } },
    blending: dark ? NormalBlending : AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
}
