/**
 * The simulation: N-body integration of the Sun, planets (system barycentres), Earth,
 * Moon, Ceres, comet Halley and three spacecraft, plus Kepler-propagated major moons.
 *
 * All positions are barycentric, ecliptic J2000, in AU. Time is a Julian date (TDB).
 */
import { BODIES, BODY, CHARON_PLUTO_MASS_RATIO, INTEGRATED, type BodyDef } from '../data/bodies';
import epochData from '../data/generated/horizons-epoch.json';
import moonData from '../data/generated/horizons-moons.json';
import { AU_KM, gmToAuDay, mod, TAU } from '../core/units';
import { NBody } from './nbody';
import { elementsFromHorizons, positionAt, type Elements } from './kepler';
import { lockedOrientation, orientation, type Orientation } from './rotation';
import { cross, eclToScene, norm, type V3 } from './frames';

export interface MoonOrbit {
  key: string;
  parent: string;
  /** elements in km and rad/day, relative to the planet centre, ecliptic J2000 */
  el: Elements;
  jd0: number;
}

export const EPOCH_JD: number = epochData.jd;

/** Maximum integration steps per frame before the clock is slowed down to keep up. */
const STEP_BUDGET = 6000;

export class Simulation {
  readonly nbody: NBody;
  readonly moons: MoonOrbit[];
  /** display time (JD TDB); the integrator grid state is within one step of it */
  jd: number;
  /** barycentric positions/velocities at `jd`, per body key (AU, AU/day) */
  readonly pos = new Map<string, V3>();
  readonly vel = new Map<string, V3>();
  private sr: Float64Array;
  private sv: Float64Array;
  /** true if the last advance could not keep up with the requested rate */
  throttled = false;

  constructor() {
    const bodies = INTEGRATED;
    const states = epochData.bodies as Record<string, { r: number[]; v: number[] }>;
    this.nbody = new NBody({
      keys: bodies.map((b) => b.key),
      gm: bodies.map((b) => gmToAuDay(b.gm)),
      r: bodies.map((b) => states[b.stateKey!].r),
      v: bodies.map((b) => states[b.stateKey!].v),
      t0: epochData.jd,
    });
    this.sr = new Float64Array(this.nbody.n * 3);
    this.sv = new Float64Array(this.nbody.n * 3);
    const mo = moonData.moons as Record<string, Parameters<typeof elementsFromHorizons>[0] & { jd: number }>;
    this.moons = BODIES.filter((b) => b.kind === 'moon' && !b.stateKey).map((b) => ({
      key: b.key,
      parent: b.parent!,
      el: elementsFromHorizons(mo[b.key]),
      jd0: mo[b.key].jd,
    }));
    this.jd = epochData.jd;
    this.refresh();
  }

  /**
   * Move the display clock by `days` (negative = backwards). Integrates whole steps up to
   * a per-frame budget; if the budget runs out the clock advances only as far as the
   * integration got, so the picture never lies about where things are.
   */
  advance(days: number) {
    const target = this.jd + days;
    const before = this.nbody.t;
    this.nbody.advanceToward(target, STEP_BUDGET);
    const reached = Math.abs(this.nbody.t - target) <= this.nbody.dt + 1e-9;
    this.throttled = !reached;
    this.jd = reached ? target : this.nbody.t;
    if (!reached && this.nbody.t === before) this.jd = before;
    this.refresh();
  }

  /** Jump to a date, integrating in chunks so the page stays responsive. */
  async seek(jd: number, onProgress?: (f: number) => void) {
    const start = this.nbody.t;
    const total = Math.abs(jd - start) || 1;
    while (Math.abs(this.nbody.t - jd) > this.nbody.dt) {
      this.nbody.advanceToward(jd, 20_000);
      onProgress?.(Math.min(1, Math.abs(this.nbody.t - start) / total));
      await new Promise((r) => setTimeout(r, 0));
    }
    this.jd = jd;
    this.refresh();
    onProgress?.(1);
  }

  /** Recompute all positions at the display time. */
  refresh() {
    const { nbody, sr, sv } = this;
    nbody.sample(this.jd, sr, sv);
    for (let i = 0; i < nbody.n; i++) {
      this.pos.set(nbody.keys[i], [sr[i * 3], sr[i * 3 + 1], sr[i * 3 + 2]]);
      this.vel.set(nbody.keys[i], [sv[i * 3], sv[i * 3 + 1], sv[i * 3 + 2]]);
    }
    for (const m of this.moons) {
      const rel = this.moonOffset(m, this.jd);
      const p = this.pos.get(m.parent)!;
      this.pos.set(m.key, [p[0] + rel[0], p[1] + rel[1], p[2] + rel[2]]);
      this.vel.set(m.key, this.vel.get(m.parent)!);
    }
    // Pluto–Charon: Horizons gives the barycentre; split it with the mass ratio.
    const charon = this.moons.find((m) => m.key === 'charon');
    if (charon) {
      const bary = this.pos.get('pluto')!;
      const rel = this.moonOffset(charon, this.jd);
      const q = CHARON_PLUTO_MASS_RATIO;
      this.pos.set('pluto', [bary[0] - (rel[0] * q) / (1 + q), bary[1] - (rel[1] * q) / (1 + q), bary[2] - (rel[2] * q) / (1 + q)]);
      this.pos.set('charon', [bary[0] + rel[0] / (1 + q), bary[1] + rel[1] / (1 + q), bary[2] + rel[2] / (1 + q)]);
      this.pos.set('pluto-barycentre', bary);
    }
  }

  /** Moon position relative to its planet centre, AU, ecliptic. */
  moonOffset(m: MoonOrbit, jd: number): V3 {
    const p = positionAt(m.el, m.el.M + m.el.n * (jd - m.jd0));
    return [p[0] / AU_KM, p[1] / AU_KM, p[2] / AU_KM];
  }

  /** Orbit normal of a moon (ecliptic). */
  moonNormal(m: MoonOrbit): V3 {
    const { i, node } = m.el;
    return [Math.sin(i) * Math.sin(node), -Math.sin(i) * Math.cos(node), Math.cos(i)];
  }

  /** Orientation of a body in scene axes at the display time. */
  orientation(key: string): Orientation | null {
    const b: BodyDef | undefined = BODY[key];
    if (!b) return null;
    if (b.rotation) return orientation(b.rotation, this.jd);
    if (b.locked && b.parent) {
      const m = this.moons.find((x) => x.key === key);
      const p = this.pos.get(b.parent)!;
      const s = this.pos.get(key)!;
      const toPlanet = eclToScene([p[0] - s[0], p[1] - s[1], p[2] - s[2]]);
      const n = m ? eclToScene(this.moonNormal(m)) : ([0, 1, 0] as V3);
      return lockedOrientation(toPlanet, n);
    }
    return null;
  }

  /** Heliocentric distance in AU. */
  sunDistance(key: string) {
    const s = this.pos.get('sun')!;
    const p = this.pos.get(key)!;
    return Math.hypot(p[0] - s[0], p[1] - s[1], p[2] - s[2]);
  }

  /** Heliocentric speed in km/s. */
  sunSpeedKms(key: string) {
    const s = this.vel.get('sun')!;
    const v = this.vel.get(key)!;
    return (Math.hypot(v[0] - s[0], v[1] - s[1], v[2] - s[2]) * AU_KM) / 86_400;
  }

  /** Heliocentric state (for drawing the osculating orbit). */
  helioState(key: string): { r: V3; v: V3 } {
    const s = this.pos.get('sun')!, sv = this.vel.get('sun')!;
    const p = this.pos.get(key)!, v = this.vel.get(key)!;
    return { r: [p[0] - s[0], p[1] - s[1], p[2] - s[2]], v: [v[0] - sv[0], v[1] - sv[1], v[2] - sv[2]] };
  }

  /** Fraction of the moon's orbit for a phase readout. */
  moonPhase(m: MoonOrbit) {
    return mod(m.el.M + m.el.n * (this.jd - m.jd0), TAU) / TAU;
  }

  /** Normal of an orbit plane through r × v (ecliptic → scene). */
  static orbitNormal(r: V3, v: V3): V3 {
    return eclToScene(norm(cross(r, v)));
  }
}
