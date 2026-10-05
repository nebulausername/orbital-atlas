/**
 * Body orientation from the IAU WGCCRE rotation elements (Archinal et al. 2018).
 *
 * Returns the body-fixed axes in scene coordinates:
 *   pole  = spin axis (north pole by IAU definition)
 *   prime = direction of the prime meridian on the equator (longitude 0)
 *   east  = pole × prime (longitude +90° east)
 * The planet meshes use local +Y = pole, +X = prime, −Z = east.
 */
import { DEG, J2000, mod } from '../core/units';
import type { RotationModel } from '../data/bodies';
import { cross, eclToScene, eqToEcl, norm, radecToVec, type V3 } from './frames';

export interface Orientation {
  pole: V3;
  prime: V3;
  east: V3;
  /** rotation angle W in degrees (for display) */
  wDeg: number;
}

export function orientation(m: RotationModel, jd: number): Orientation {
  const d = jd - J2000;
  const T = d / 36_525;
  let ra = m.ra0 + (m.ra1 ?? 0) * T;
  let dec = m.dec0 + (m.dec1 ?? 0) * T;
  let W = m.w0 + m.wd * d;
  if (m.neptuneTerms) {
    const N = (357.85 + 52.316 * T) * DEG;
    ra += 0.7 * Math.sin(N);
    dec -= 0.51 * Math.cos(N);
    W -= 0.48 * Math.sin(N);
  }
  const poleEq = radecToVec(ra, dec);
  // ascending node of the body equator on the ICRF equator, at RA = α0 + 90°
  const nodeEq: V3 = [-Math.sin(ra * DEG), Math.cos(ra * DEG), 0];
  const q = cross(poleEq, nodeEq);
  const w = W * DEG;
  const primeEq: V3 = [
    nodeEq[0] * Math.cos(w) + q[0] * Math.sin(w),
    nodeEq[1] * Math.cos(w) + q[1] * Math.sin(w),
    nodeEq[2] * Math.cos(w) + q[2] * Math.sin(w),
  ];
  const pole = norm(eclToScene(eqToEcl(poleEq)));
  const prime = norm(eclToScene(eqToEcl(primeEq)));
  return { pole, prime, east: cross(pole, prime), wDeg: mod(W, 360) };
}

/** Orientation of a tidally locked moon: prime meridian points at the planet, pole ⟂ orbit. */
export function lockedOrientation(toPlanet: V3, orbitNormal: V3): Orientation {
  const pole = norm(orbitNormal);
  // remove any component along the pole so the axes stay orthonormal
  const d = toPlanet[0] * pole[0] + toPlanet[1] * pole[1] + toPlanet[2] * pole[2];
  const prime = norm([toPlanet[0] - d * pole[0], toPlanet[1] - d * pole[1], toPlanet[2] - d * pole[2]]);
  return { pole, prime, east: cross(pole, prime), wDeg: 0 };
}
