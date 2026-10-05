/**
 * Newtonian N-body integrator.
 *
 * - Frame: solar-system barycentre, ecliptic J2000. Units: AU, day, GM in AU³/day².
 * - Scheme: 4th-order symplectic composition of drift-kick-drift leapfrog (Yoshida 1990,
 *   Phys. Lett. A 150, 262). Symplectic → energy error stays bounded instead of drifting,
 *   and the scheme is time-reversible, so the simulation runs backwards just as well.
 * - Massive bodies attract each other; test particles (comet, spacecraft) feel every
 *   massive body but pull on nothing.
 * - Optional first post-Newtonian correction for the Sun (Schwarzschild term in harmonic
 *   coordinates, as used for planetary ephemerides; e.g. Benitez & Gallardo 2008). It
 *   supplies Mercury's extra 43″/century of perihelion advance. The term depends on
 *   velocity, so each kick evaluates it at the mid-kick velocity v + ½·h·a_Newton —
 *   this keeps the scheme symmetric (time-reversible to round-off) and second-order in
 *   the tiny relativistic part. Everything else is plain Newton.
 *
 * The state lives on a fixed time grid t0 + k·dt. For display at any time in between,
 * `sample()` takes one partial step from a copy, so the grid state is never disturbed.
 */
import { C_AU_D } from '../core/units';

const CBRT2 = Math.cbrt(2);
const W1 = 1 / (2 - CBRT2);
const W0 = -CBRT2 / (2 - CBRT2);
/** drift coefficients c1..c4 and kick coefficients d1..d3 */
const C = [W1 / 2, (W0 + W1) / 2, (W0 + W1) / 2, W1 / 2];
const D = [W1, W0, W1];
const C2 = C_AU_D * C_AU_D;

export interface NBodyInit {
  keys: string[];
  /** GM in AU³/day², 0 for test particles; massive bodies must come first */
  gm: number[];
  r: number[][];
  v: number[][];
  t0: number;
}

export class NBody {
  readonly n: number;
  readonly nMassive: number;
  readonly keys: string[];
  readonly gm: Float64Array;
  readonly r: Float64Array;
  readonly v: Float64Array;
  /** Julian date (TDB) of the grid state */
  t: number;
  /** 1.5 h: Mercury and the Moon stay within a few km / ~200 km of DE441 over ten years */
  dt = 0.0625;
  relativity = true;
  /** index of the Sun for the relativistic term (−1 = none) */
  private sun: number;
  private a: Float64Array;
  /** scratch copy for sample() */
  private sr: Float64Array;
  private sv: Float64Array;
  private initialEnergy: number;

  constructor(init: NBodyInit) {
    this.n = init.keys.length;
    this.keys = init.keys;
    this.gm = Float64Array.from(init.gm);
    this.nMassive = init.gm.findIndex((g) => g === 0);
    if (this.nMassive < 0) this.nMassive = this.n;
    if (init.gm.slice(this.nMassive).some((g) => g !== 0)) throw new Error('massive bodies must come first');
    this.r = new Float64Array(this.n * 3);
    this.v = new Float64Array(this.n * 3);
    for (let i = 0; i < this.n; i++) {
      this.r.set(init.r[i], i * 3);
      this.v.set(init.v[i], i * 3);
    }
    this.t = init.t0;
    this.sun = init.keys.indexOf('sun');
    this.a = new Float64Array(this.n * 3);
    this.sr = new Float64Array(this.n * 3);
    this.sv = new Float64Array(this.n * 3);
    this.initialEnergy = this.energy();
  }

  index(key: string) {
    return this.keys.indexOf(key);
  }

  /**
   * Accelerations into this.a. The relativistic term uses the velocity v + kick·a_N,
   * i.e. the estimated velocity half-way through the kick that is about to be applied.
   */
  private accel(r: Float64Array, v: Float64Array, halfKick: number) {
    const { n, nMassive, gm, a } = this;
    a.fill(0);
    for (let i = 0; i < nMassive; i++) {
      const ix = i * 3;
      for (let j = i + 1; j < n; j++) {
        const jx = j * 3;
        const dx = r[jx] - r[ix];
        const dy = r[jx + 1] - r[ix + 1];
        const dz = r[jx + 2] - r[ix + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        const inv3 = 1 / (d2 * Math.sqrt(d2));
        // i pulls j
        const fi = gm[i] * inv3;
        a[jx] -= fi * dx;
        a[jx + 1] -= fi * dy;
        a[jx + 2] -= fi * dz;
        // j pulls i (zero for test particles)
        const fj = gm[j] * inv3;
        a[ix] += fj * dx;
        a[ix + 1] += fj * dy;
        a[ix + 2] += fj * dz;
      }
    }
    if (this.relativity && this.sun >= 0) {
      const s = this.sun * 3;
      const mu = gm[this.sun];
      const svx = v[s] + halfKick * a[s], svy = v[s + 1] + halfKick * a[s + 1], svz = v[s + 2] + halfKick * a[s + 2];
      for (let j = 0; j < n; j++) {
        if (j === this.sun) continue;
        const jx = j * 3;
        const x = r[jx] - r[s], y = r[jx + 1] - r[s + 1], z = r[jx + 2] - r[s + 2];
        const vx = v[jx] + halfKick * a[jx] - svx;
        const vy = v[jx + 1] + halfKick * a[jx + 1] - svy;
        const vz = v[jx + 2] + halfKick * a[jx + 2] - svz;
        const rr = Math.sqrt(x * x + y * y + z * z);
        const v2 = vx * vx + vy * vy + vz * vz;
        const rv = x * vx + y * vy + z * vz;
        const k = mu / (C2 * rr * rr * rr);
        const fr = k * ((4 * mu) / rr - v2);
        const fv = k * 4 * rv;
        a[jx] += fr * x + fv * vx;
        a[jx + 1] += fr * y + fv * vy;
        a[jx + 2] += fr * z + fv * vz;
      }
    }
  }

  /** One Yoshida step of size h (may be negative) on the given arrays. */
  private stepArrays(r: Float64Array, v: Float64Array, h: number) {
    const m = this.n * 3;
    for (let s = 0; s < 4; s++) {
      const c = C[s] * h;
      for (let k = 0; k < m; k++) r[k] += c * v[k];
      if (s === 3) break;
      const d = D[s] * h;
      this.accel(r, v, d / 2);
      const a = this.a;
      for (let k = 0; k < m; k++) v[k] += d * a[k];
    }
  }

  step(h = this.dt) {
    this.stepArrays(this.r, this.v, h);
    this.t += h;
  }

  /**
   * Advance the grid state toward `target` (either direction) by whole steps, at most
   * `maxSteps`. Returns the number of steps taken.
   */
  advanceToward(target: number, maxSteps = Infinity): number {
    const dir = Math.sign(target - this.t);
    if (dir === 0) return 0;
    const h = dir * this.dt;
    let steps = 0;
    while (steps < maxSteps && (dir > 0 ? this.t + h <= target + 1e-9 : this.t + h >= target - 1e-9)) {
      this.step(h);
      steps++;
    }
    return steps;
  }

  /** Positions (and velocities) at time t, assuming |t − grid t| ≤ dt. Written to out arrays. */
  sample(t: number, outR: Float64Array, outV?: Float64Array) {
    const h = t - this.t;
    this.sr.set(this.r);
    this.sv.set(this.v);
    if (Math.abs(h) > 1e-12) this.stepArrays(this.sr, this.sv, h);
    outR.set(this.sr);
    if (outV) outV.set(this.sv);
  }

  /** Total Newtonian energy of the massive subsystem (AU²/day² × solar-mass units of GM). */
  energy(): number {
    const { nMassive, gm, r, v } = this;
    let e = 0;
    for (let i = 0; i < nMassive; i++) {
      const ix = i * 3;
      const v2 = v[ix] ** 2 + v[ix + 1] ** 2 + v[ix + 2] ** 2;
      e += 0.5 * gm[i] * v2;
      for (let j = i + 1; j < nMassive; j++) {
        const jx = j * 3;
        const d = Math.hypot(r[jx] - r[ix], r[jx + 1] - r[ix + 1], r[jx + 2] - r[ix + 2]);
        e -= (gm[i] * gm[j]) / d;
      }
    }
    return e;
  }

  /** Relative energy change since construction. */
  energyDrift(): number {
    return (this.energy() - this.initialEnergy) / Math.abs(this.initialEnergy);
  }

  /** Copy of the grid state, e.g. to rewind cheaply. */
  snapshot() {
    return { t: this.t, r: this.r.slice(), v: this.v.slice() };
  }

  restore(s: { t: number; r: Float64Array; v: Float64Array }) {
    this.t = s.t;
    this.r.set(s.r);
    this.v.set(s.v);
  }
}
