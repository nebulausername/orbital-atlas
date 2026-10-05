/**
 * Reference frames.
 *
 *  - ICRF / equatorial J2000 (the frame of catalogues and IAU rotation elements)
 *  - ecliptic J2000 (the frame of the Horizons state vectors and the integrator)
 *  - scene: ecliptic rotated so that the ecliptic plane is horizontal (three.js is y-up):
 *      scene = (x_ecl, z_ecl, −y_ecl)
 *  - galactic (IAU 1958, J2000 realisation) for the Milky Way model
 */
import { DEG } from '../core/units';

export type V3 = [number, number, number];

/** Obliquity of the ecliptic at J2000 (IAU 2006), degrees. */
export const OBLIQUITY_J2000 = 23.439_279_44;
const CE = Math.cos(OBLIQUITY_J2000 * DEG);
const SE = Math.sin(OBLIQUITY_J2000 * DEG);

export function eqToEcl([x, y, z]: V3): V3 {
  return [x, CE * y + SE * z, -SE * y + CE * z];
}

export function eclToEq([x, y, z]: V3): V3 {
  return [x, CE * y - SE * z, SE * y + CE * z];
}

export function eclToScene([x, y, z]: V3): V3 {
  return [x, z, -y];
}

export function sceneToEcl([x, y, z]: V3): V3 {
  return [x, -z, y];
}

/** Unit vector for right ascension / declination (degrees) in the equatorial frame. */
export function radecToVec(raDeg: number, decDeg: number): V3 {
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}

export const radecToScene = (raDeg: number, decDeg: number): V3 => eclToScene(eqToEcl(radecToVec(raDeg, decDeg)));

export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => scale(a, 1 / (len(a) || 1));

/**
 * Galactic frame in scene coordinates. North galactic pole and the direction of the
 * Galactic centre in ICRS (Reid & Brunthaler 2004 / Hipparcos realisation):
 *   NGP  α = 192.85948°, δ = +27.12825°
 *   l=0  α = 266.40499°, δ = −28.93617°
 */
export const GAL_X = radecToScene(266.404_99, -28.936_17); // toward the Galactic centre
export const GAL_Z = radecToScene(192.859_48, 27.128_25); // north galactic pole
export const GAL_Y = cross(GAL_Z, GAL_X); // toward l = 90°, the direction of Galactic rotation
