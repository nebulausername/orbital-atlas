/**
 * Orbits (osculating ellipses from the current state vectors), trails (what the integrator
 * actually computed) and the historic paths of the spacecraft. All vertices are rebuilt
 * relative to the camera every frame in float64, so lines stay exact at any zoom.
 */
import { AdditiveBlending, Color, type Scene, type InterleavedBufferAttribute, type InstancedInterleavedBuffer } from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { BODIES, BODY, type BodyDef } from '../data/bodies';
import { AU_KM, gmToAuDay, smoothstep } from '../core/units';
import { eclToScene, type V3 } from '../physics/frames';
import { elementsFromState, ellipsePoints, positionAt, type Elements } from '../physics/kepler';
import trajectories from '../data/generated/horizons-trajectories.json';
import type { Frame } from './frame';
import type { BodiesLayer } from './bodies';

const VERMILION = new Color('#ff5a36');

class FatLine {
  readonly geom = new LineGeometry();
  readonly line: Line2;
  private pos: Float32Array;
  private col: Float32Array;
  constructor(readonly max: number, readonly mat: LineMaterial) {
    this.geom.setPositions(new Float32Array(max * 3));
    this.geom.setColors(new Float32Array(max * 3));
    this.line = new Line2(this.geom, mat);
    this.line.frustumCulled = false;
    this.line.renderOrder = 4;
    this.pos = ((this.geom.attributes.instanceStart as InterleavedBufferAttribute).data as InstancedInterleavedBuffer).array as Float32Array;
    this.col = ((this.geom.attributes.instanceColorStart as InterleavedBufferAttribute).data as InstancedInterleavedBuffer).array as Float32Array;
  }
  /** points: flat xyz in render space; colour(i) returns [r,g,b] premultiplied by alpha */
  set(points: Float32Array, n: number, colour: (i: number, out: number[]) => void) {
    const m = Math.min(n, this.max);
    const c0 = [0, 0, 0], c1 = [0, 0, 0];
    for (let i = 0; i < m - 1; i++) {
      const o = i * 6;
      this.pos[o] = points[i * 3];
      this.pos[o + 1] = points[i * 3 + 1];
      this.pos[o + 2] = points[i * 3 + 2];
      this.pos[o + 3] = points[i * 3 + 3];
      this.pos[o + 4] = points[i * 3 + 4];
      this.pos[o + 5] = points[i * 3 + 5];
      colour(i, c0);
      colour(i + 1, c1);
      this.col[o] = c0[0];
      this.col[o + 1] = c0[1];
      this.col[o + 2] = c0[2];
      this.col[o + 3] = c1[0];
      this.col[o + 4] = c1[1];
      this.col[o + 5] = c1[2];
    }
    (this.geom.attributes.instanceStart as InterleavedBufferAttribute).data.needsUpdate = true;
    (this.geom.attributes.instanceColorStart as InterleavedBufferAttribute).data.needsUpdate = true;
    this.geom.instanceCount = Math.max(0, m - 1);
  }
  hide() {
    this.geom.instanceCount = 0;
  }
}

function material(width: number, dashed = false) {
  const m = new LineMaterial({ linewidth: width, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, worldUnits: false, dashed });
  if (dashed) {
    m.dashSize = 6;
    m.gapSize = 5;
  }
  return m;
}

interface OrbitEntry {
  def: BodyDef;
  line: FatLine;
  /** heliocentric (or planet-centric for moons) ellipse in scene axes, AU */
  pts: V3[];
  el?: Elements;
  lastJd: number;
  centre: 'sun' | string;
}

interface Trail {
  def: BodyDef;
  line: FatLine;
  pts: Float64Array;
  head: number;
  count: number;
  lastJd: number;
  interval: number;
  relative?: string;
}

const MAX_TRAIL = 360;
const scratch = new Float32Array(Math.max(1025, 2000) * 3);

export class LinesLayer {
  private orbits: OrbitEntry[] = [];
  private trails: Trail[] = [];
  private craft: { key: string; line: FatLine; pts: V3[] }[] = [];
  private materials: LineMaterial[] = [];

  constructor(scene: Scene, private bodies: BodiesLayer) {
    const orbitMat = material(1.1);
    const selMat = material(1.8);
    const trailMat = material(1.7);
    const craftMat = material(1.2, false);
    this.materials.push(orbitMat, selMat, trailMat, craftMat);
    for (const def of BODIES) {
      if (def.kind === 'star') continue;
      if (def.kind !== 'spacecraft') {
        const segs = def.key === 'halley' ? 1024 : 384;
        const line = new FatLine(segs + 1, orbitMat);
        scene.add(line.line);
        this.orbits.push({ def, line, pts: [], lastJd: -Infinity, centre: def.kind === 'moon' ? def.parent! : 'sun' });
      }
      const tl = new FatLine(MAX_TRAIL, trailMat);
      scene.add(tl.line);
      const period = Math.abs(def.facts?.periodD ?? 365);
      this.trails.push({
        def,
        line: tl,
        pts: new Float64Array(MAX_TRAIL * 3),
        head: 0,
        count: 0,
        lastJd: NaN,
        interval: def.kind === 'spacecraft' ? 20 : Math.max(0.02, (period * 0.8) / MAX_TRAIL),
        relative: def.kind === 'moon' ? def.parent : undefined,
      });
    }
    const tr = trajectories.craft as Record<string, number[][]>;
    for (const key of Object.keys(tr)) {
      const pts = tr[key].map(([, x, y, z]) => eclToScene([x, y, z]));
      const line = new FatLine(pts.length, craftMat);
      scene.add(line.line);
      this.craft.push({ key, line, pts });
    }
    // the selected body's orbit is drawn with a heavier pen
    this.selMat = selMat;
    this.orbitMat = orbitMat;
  }
  private selMat: LineMaterial;
  private orbitMat: LineMaterial;

  resize(w: number, h: number) {
    this.materials.forEach((m) => m.resolution.set(w, h));
  }

  /** Intermediate trail points between two dates from a Kepler orbit (scene axes, relative to base). */
  private fill(t: Trail, f: Frame, from: number, to: number, base: V3) {
    const sim = f.sim;
    const n = Math.min(MAX_TRAIL - 1, Math.floor(Math.abs(to - from) / t.interval) - 1);
    if (n <= 0) return;
    const moon = sim.moons.find((m) => m.key === t.def.key);
    let pointAt: (jd: number) => V3 | null;
    if (moon) {
      pointAt = (jd) => eclToScene(sim.moonOffset(moon, jd));
    } else {
      const centre = t.def.key === 'moon' ? 'earth' : 'sun';
      const pc = sim.pos.get(centre)!, vc = sim.vel.get(centre)!;
      const pb = sim.pos.get(t.def.key)!, vb = sim.vel.get(t.def.key)!;
      const mu = gmToAuDay((centre === 'earth' ? BODY.earth.gm : BODY.sun.gm) + t.def.gm);
      const el = elementsFromState([pb[0] - pc[0], pb[1] - pc[1], pb[2] - pc[2]], [vb[0] - vc[0], vb[1] - vc[1], vb[2] - vc[2]], mu);
      if (!(el.e < 1) || !(el.a > 0)) return;
      const off = centre === 'sun' ? eclToScene(pc) : null;
      pointAt = (jd) => {
        const q = eclToScene(positionAt(el, el.M + el.n * (jd - to)));
        // planets' trails are barycentric: add the (slowly moving) Sun
        return off ? [q[0] + off[0], q[1] + off[1], q[2] + off[2]] : [q[0], q[1], q[2]];
      };
    }
    for (let i = 1; i <= n; i++) {
      const jd = from + ((to - from) * i) / (n + 1);
      const q = pointAt(jd);
      if (!q) continue;
      const k = t.head * 3;
      // moons' trails are stored relative to the planet; others are absolute
      t.pts[k] = q[0] - (moon || t.relative ? 0 : base[0]);
      t.pts[k + 1] = q[1] - (moon || t.relative ? 0 : base[1]);
      t.pts[k + 2] = q[2] - (moon || t.relative ? 0 : base[2]);
      t.head = (t.head + 1) % MAX_TRAIL;
      t.count = Math.min(MAX_TRAIL, t.count + 1);
    }
  }

  resetTrails() {
    for (const t of this.trails) {
      t.count = 0;
      t.head = 0;
      t.lastJd = NaN;
    }
  }

  update(f: Frame) {
    const sim = f.sim;
    const jd = sim.jd;
    const sun = f.pos.get('sun')!;
    const st = this.bodies.states;
    const camDistSun = Math.hypot(sun[0] - f.cam[0], sun[1] - f.cam[1], sun[2] - f.cam[2]);
    const sysFade = 1 - smoothstep(3.6, 4.8, Math.log10(camDistSun));

    // ---- osculating orbits ----
    for (const o of this.orbits) {
      const s = st.get(o.def.key);
      const selected = f.selectedKey === o.def.key;
      o.line.line.material = selected ? this.selMat : this.orbitMat;
      let alpha = f.showOrbits * (selected ? 1 : 0.42);
      if (o.def.kind === 'moon') {
        const parent = st.get(o.centre);
        const aAu = (o.def.facts?.aKm ?? 1e5) / AU_KM;
        // only when the moon's orbit spans a useful number of pixels
        const px = parent ? (aAu / parent.dist) * f.pxPerRad : 0;
        alpha *= smoothstep(14, 40, px) * (s && s.merged ? 0 : 1);
        if (parent && parent.px > px * 0.9) alpha = 0;
      } else {
        alpha *= sysFade;
        if (o.def.kind === 'comet') alpha *= 0.8;
      }
      // close to a body its own orbit only cuts through it
      if (s && o.def.key === f.focusKey) alpha *= smoothstep(30, 400, s.dist / s.rTrue);
      if (alpha < 0.004 || !s) {
        o.line.hide();
        continue;
      }
      // rebuild the ellipse when the state has moved on noticeably
      if (Math.abs(jd - o.lastJd) > (o.def.kind === 'moon' ? 0.5 : 5) || o.pts.length === 0) {
        o.lastJd = jd;
        if (o.def.kind === 'moon' && o.def.key !== 'moon') {
          const m = sim.moons.find((x) => x.key === o.def.key)!;
          o.pts = ellipsePoints(m.el, 256).map((p) => eclToScene([p[0] / AU_KM, p[1] / AU_KM, p[2] / AU_KM]));
        } else {
          let r: V3, v: V3, mu: number;
          if (o.def.key === 'moon') {
            const pe = sim.pos.get('earth')!, pm = sim.pos.get('moon')!, ve = sim.vel.get('earth')!, vm = sim.vel.get('moon')!;
            r = [pm[0] - pe[0], pm[1] - pe[1], pm[2] - pe[2]];
            v = [vm[0] - ve[0], vm[1] - ve[1], vm[2] - ve[2]];
            mu = gmToAuDay(BODY.earth.gm + BODY.moon.gm);
          } else {
            ({ r, v } = sim.helioState(o.def.key === 'pluto' ? 'pluto' : o.def.key));
            if (o.def.key === 'pluto' || o.def.key === 'charon') {
              const b = sim.pos.get('pluto-barycentre')!;
              const s0 = sim.pos.get('sun')!;
              r = [b[0] - s0[0], b[1] - s0[1], b[2] - s0[2]];
            }
            mu = gmToAuDay(BODY.sun.gm + o.def.gm);
          }
          const el = elementsFromState(r, v, mu);
          if (el.e >= 0.999 || !(el.a > 0)) {
            o.pts = [];
          } else {
            o.pts = ellipsePoints(el, o.def.key === 'halley' ? 1024 : 384).map((p) => eclToScene(p));
          }
        }
      }
      const c = o.centre === 'sun' ? sun : f.pos.get(o.centre === 'earth' ? 'earth' : o.centre)!;
      const n = o.pts.length;
      for (let i = 0; i < n; i++) {
        const p = o.pts[i];
        scratch[i * 3] = (c[0] + p[0] - f.cam[0]) * f.s;
        scratch[i * 3 + 1] = (c[1] + p[1] - f.cam[1]) * f.s;
        scratch[i * 3 + 2] = (c[2] + p[2] - f.cam[2]) * f.s;
      }
      const ink = selected ? VERMILION : new Color(o.def.ink);
      o.line.set(scratch, n, (_i, out) => {
        out[0] = ink.r * alpha;
        out[1] = ink.g * alpha;
        out[2] = ink.b * alpha;
      });
    }

    // ---- trails ----
    for (const t of this.trails) {
      const p = f.pos.get(t.def.key);
      if (!p) continue;
      const base = t.relative ? f.pos.get(t.relative)! : ([0, 0, 0] as V3);
      if (Number.isNaN(t.lastJd) || Math.abs(jd - t.lastJd) >= t.interval) {
        const gap = Math.abs(jd - t.lastJd);
        if (!Number.isNaN(t.lastJd) && gap > t.interval * MAX_TRAIL) t.count = 0; // a jump: start over
        // a fast body moved further than one trail step this frame: fill in the path
        // with two-body positions so trails stay smooth curves, never polygons
        if (!Number.isNaN(t.lastJd) && gap > t.interval * 1.5 && gap <= t.interval * MAX_TRAIL) this.fill(t, f, t.lastJd, jd, base);
        t.lastJd = jd;
        const k = t.head * 3;
        t.pts[k] = p[0] - base[0];
        t.pts[k + 1] = p[1] - base[1];
        t.pts[k + 2] = p[2] - base[2];
        t.head = (t.head + 1) % MAX_TRAIL;
        t.count = Math.min(MAX_TRAIL, t.count + 1);
      }
      const s = st.get(t.def.key);
      const selected = f.selectedKey === t.def.key;
      let alpha = f.showTrails * (selected ? 1 : 0.75);
      if (t.def.kind === 'moon') {
        const parent = st.get(t.relative!);
        const aAu = (t.def.facts?.aKm ?? 1e5) / AU_KM;
        const px = parent ? (aAu / parent.dist) * f.pxPerRad : 0;
        alpha *= smoothstep(14, 40, px) * (s && s.merged ? 0 : 1);
      } else if (t.def.kind !== 'spacecraft') {
        alpha *= sysFade;
      } else {
        alpha *= 1 - smoothstep(5.2, 6.2, Math.log10(camDistSun));
      }
      if (s && t.def.key === f.focusKey) alpha *= smoothstep(30, 400, s.dist / s.rTrue);
      if (alpha < 0.004 || t.count < 2) {
        t.line.hide();
        continue;
      }
      // oldest → newest, then the live position so the trail touches the body
      const n = t.count;
      const start = (t.head - n + MAX_TRAIL) % MAX_TRAIL;
      for (let i = 0; i < n; i++) {
        const k = ((start + i) % MAX_TRAIL) * 3;
        scratch[i * 3] = (base[0] + t.pts[k] - f.cam[0]) * f.s;
        scratch[i * 3 + 1] = (base[1] + t.pts[k + 1] - f.cam[1]) * f.s;
        scratch[i * 3 + 2] = (base[2] + t.pts[k + 2] - f.cam[2]) * f.s;
      }
      scratch[n * 3] = (p[0] - f.cam[0]) * f.s;
      scratch[n * 3 + 1] = (p[1] - f.cam[1]) * f.s;
      scratch[n * 3 + 2] = (p[2] - f.cam[2]) * f.s;
      const ink = t.def.kind === 'spacecraft' ? VERMILION : new Color(t.def.ink);
      t.line.set(scratch, n + 1, (i, out) => {
        const a = alpha * (i / n) ** 1.6;
        out[0] = ink.r * a;
        out[1] = ink.g * a;
        out[2] = ink.b * a;
      });
    }

    // ---- spacecraft history (launch → epoch), heliocentric ----
    const craftAlpha = f.showOrbits * 0.55 * (1 - smoothstep(5.0, 6.0, Math.log10(camDistSun)));
    for (const c of this.craft) {
      if (craftAlpha < 0.004) {
        c.line.hide();
        continue;
      }
      const n = c.pts.length;
      for (let i = 0; i < n; i++) {
        const p = c.pts[i];
        scratch[i * 3] = (sun[0] + p[0] - f.cam[0]) * f.s;
        scratch[i * 3 + 1] = (sun[1] + p[1] - f.cam[1]) * f.s;
        scratch[i * 3 + 2] = (sun[2] + p[2] - f.cam[2]) * f.s;
      }
      const sel = f.selectedKey === c.key ? 1.8 : 0.6;
      c.line.set(scratch, n, (i, out) => {
        // the launch spiral through the inner system fades out; the cruise stays
        const p = c.pts[i];
        const r = Math.hypot(p[0], p[1], p[2]);
        const a = craftAlpha * sel * (0.25 + 0.75 * (i / n)) * (f.selectedKey === c.key ? 1 : smoothstep(1.6, 4.5, r));
        out[0] = VERMILION.r * a;
        out[1] = VERMILION.g * a;
        out[2] = VERMILION.b * a;
      });
    }
  }
}
