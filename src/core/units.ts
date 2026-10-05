/** Physical constants and unit conversions. Internal units: AU, day (TDB), degrees only at the edges. */

/** IAU 2012 Resolution B2: the astronomical unit, exact. */
export const AU_KM = 149_597_870.7;
export const DAY_S = 86_400;
/** Julian date of J2000.0 (2000-01-01 12:00 TT). */
export const J2000 = 2_451_545.0;
/** Speed of light, exact. */
export const C_KM_S = 299_792.458;
export const C_AU_D = (C_KM_S * DAY_S) / AU_KM;
/** IAU light-year (Julian year × c) in AU. */
export const LY_AU = (C_KM_S * 365.25 * DAY_S) / AU_KM;
/** Parsec in AU (IAU 2015 B2: 648000/π AU). */
export const PC_AU = 648_000 / Math.PI;

export const kmToAu = (km: number) => km / AU_KM;
export const auToKm = (au: number) => au * AU_KM;
/** GM in km³/s² → AU³/day². */
export const gmToAuDay = (gmKm3s2: number) => (gmKm3s2 * DAY_S * DAY_S) / (AU_KM * AU_KM * AU_KM);

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

/** TT − UTC in seconds (TAI − UTC = 37 s since 2017, plus 32.184 s). TDB − TT is below 2 ms. */
export const TT_MINUS_UTC_S = 69.184;

/** Julian date (TDB) for a JavaScript timestamp (UTC milliseconds). */
export function jdFromUnixMs(ms: number): number {
  return ms / 86_400_000 + 2_440_587.5 + TT_MINUS_UTC_S / DAY_S;
}

/** UTC milliseconds for a Julian date (TDB). */
export function unixMsFromJd(jd: number): number {
  return (jd - 2_440_587.5 - TT_MINUS_UTC_S / DAY_S) * 86_400_000;
}

export const mod = (a: number, n: number) => ((a % n) + n) % n;
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
