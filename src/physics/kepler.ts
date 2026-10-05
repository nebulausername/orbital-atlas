/**
 * Two-body (Kepler) orbits: elements ↔ state vectors and propagation.
 * Used for the moons (Horizons osculating elements relative to their planet), for the
 * drawn osculating orbit of every body, and as a reference in the tests.
 */
import { DEG, TAU, mod } from '../core/units';
import type { V3 } from './frames';

export interface Elements {
  /** semi-major axis (any length unit) */
  a: number;
  e: number;
  /** inclination, longitude of ascending node, argument of periapsis, mean anomaly — radians */
  i: number;
  node: number;
  peri: number;
  M: number;
  /** mean motion, radians per time unit */
  n: number;
}

/** Solve Kepler's equation M = E − e sin E for the eccentric anomaly (elliptic orbits). */
export function eccentricAnomaly(M: number, e: number): number {
  M = mod(M + Math.PI, TAU) - Math.PI;
  let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
  for (let k = 0; k < 30; k++) {
    const f = E - e * Math.sin(E) - M;
    const dE = f / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-14) break;
  }
  return E;
}

/** Rotation from the orbital plane (perifocal) to the reference frame. */
function perifocalToRef(x: number, y: number, el: Elements): V3 {
  const cO = Math.cos(el.node), sO = Math.sin(el.node);
  const cw = Math.cos(el.peri), sw = Math.sin(el.peri);
  const ci = Math.cos(el.i), si = Math.sin(el.i);
  const X = (cO * cw - sO * sw * ci) * x + (-cO * sw - sO * cw * ci) * y;
  const Y = (sO * cw + cO * sw * ci) * x + (-sO * sw + cO * cw * ci) * y;
  const Z = sw * si * x + cw * si * y;
  return [X, Y, Z];
}

/** Position at mean anomaly M (elliptic). */
export function positionAt(el: Elements, M = el.M): V3 {
  const E = eccentricAnomaly(M, el.e);
  const x = el.a * (Math.cos(E) - el.e);
  const y = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  return perifocalToRef(x, y, el);
}

/** Position after dt time units. */
export function propagate(el: Elements, dt: number): V3 {
  return positionAt(el, el.M + el.n * dt);
}

/** Osculating elements from a state vector around a central body with parameter mu. */
export function elementsFromState(r: V3, v: V3, mu: number): Elements {
  const [x, y, z] = r;
  const [vx, vy, vz] = v;
  const rr = Math.hypot(x, y, z);
  const v2 = vx * vx + vy * vy + vz * vz;
  const hx = y * vz - z * vy, hy = z * vx - x * vz, hz = x * vy - y * vx;
  const h = Math.hypot(hx, hy, hz);
  const rv = x * vx + y * vy + z * vz;
  const ex = ((v2 - mu / rr) * x - rv * vx) / mu;
  const ey = ((v2 - mu / rr) * y - rv * vy) / mu;
  const ez = ((v2 - mu / rr) * z - rv * vz) / mu;
  const e = Math.hypot(ex, ey, ez);
  const energy = v2 / 2 - mu / rr;
  const a = -mu / (2 * energy);
  const i = Math.acos(Math.max(-1, Math.min(1, hz / h)));
  // node vector n = z × h
  const nx = -hy, ny = hx;
  const nn = Math.hypot(nx, ny);
  let node = nn > 1e-14 ? Math.atan2(ny, nx) : 0;
  let peri: number;
  if (e > 1e-10) {
    if (nn > 1e-14) {
      peri = Math.acos(Math.max(-1, Math.min(1, (nx * ex + ny * ey) / (nn * e))));
      if (ez < 0) peri = TAU - peri;
    } else {
      peri = Math.atan2(ey, ex);
      if (hz < 0) peri = TAU - peri;
    }
  } else {
    peri = 0;
  }
  // true anomaly
  let nu: number;
  if (e > 1e-10) {
    nu = Math.acos(Math.max(-1, Math.min(1, (ex * x + ey * y + ez * z) / (e * rr))));
    if (rv < 0) nu = TAU - nu;
  } else {
    nu = nn > 1e-14 ? Math.atan2((x * -ny + y * nx) * Math.sign(hz || 1), x * nx + y * ny) - peri : Math.atan2(y, x);
  }
  let M = 0;
  if (e < 1) {
    const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
    M = E - e * Math.sin(E);
  }
  node = mod(node, TAU);
  const n = a > 0 ? Math.sqrt(mu / (a * a * a)) : 0;
  return { a, e, i, node, peri: mod(peri, TAU), M: mod(M, TAU), n };
}

/** Elements as Horizons prints them (degrees, km, deg/s) → radians, km, rad/day. */
export function elementsFromHorizons(h: { aKm: number; e: number; iDeg: number; nodeDeg: number; periDeg: number; meanAnomalyDeg: number; meanMotionDegPerSec: number }): Elements {
  return {
    a: h.aKm,
    e: h.e,
    i: h.iDeg * DEG,
    node: h.nodeDeg * DEG,
    peri: h.periDeg * DEG,
    M: h.meanAnomalyDeg * DEG,
    n: h.meanMotionDegPerSec * DEG * 86_400,
  };
}

/** Points of the full ellipse, for drawing. */
export function ellipsePoints(el: Elements, count: number): V3[] {
  const pts: V3[] = [];
  for (let k = 0; k <= count; k++) {
    // sample uniformly in eccentric anomaly: dense near periapsis where curvature is high
    const E = (k / count) * TAU;
    const x = el.a * (Math.cos(E) - el.e);
    const y = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
    pts.push(perifocalToRef(x, y, el));
  }
  return pts;
}
