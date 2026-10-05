/**
 * Parameters of the Milky Way model. The structure numbers are measured; the point
 * cloud built from them is a drawing, not a map — arm positions beyond a few kpc from
 * the Sun are uncertain and partly hidden behind the Galactic centre.
 *
 *  - Sun–centre distance R0 = 8.2 ± 0.1 kpc, disc scale length 2.6 kpc, bar half-length
 *    ~5 kpc at ~27° to the Sun–centre line: Bland-Hawthorn & Gerhard 2016, ARA&A 54, 529.
 *  - Sun 20.8 pc above the plane: Bennett & Bovy 2019, MNRAS 482, 1417.
 *  - Arm pitch angle ~12–13°: Vallée 2017, Astrophys. Space Sci. 362, 79.
 */
export const GALAXY = {
  r0Kpc: 8.2,
  sunZKpc: 0.0208,
  diskScaleKpc: 2.6,
  diskRadiusKpc: 16,
  thinDiskHeightKpc: 0.3,
  barHalfLengthKpc: 5.0,
  barAngleDeg: 27,
  pitchDeg: 12.5,
  /**
   * Four logarithmic arms, trailing for the Galaxy's clockwise rotation (seen from the
   * north galactic pole). Each arm is fixed by its galactocentric radius in the Sun's
   * direction; with a 12.5° pitch consecutive arms differ by a factor 1.42, which puts
   * Sagittarius–Carina ~1.1 kpc inside and Perseus ~1.8 kpc outside the Sun.
   */
  arms: [
    { key: 'arm.norma', rAtSunKpc: 3.5, weight: 0.6 },
    { key: 'arm.scutum', rAtSunKpc: 4.97, weight: 1.0 },
    { key: 'arm.sagittarius', rAtSunKpc: 7.05, weight: 0.7 },
    { key: 'arm.perseus', rAtSunKpc: 10.0, weight: 1.0 },
  ],
  /** the Orion Spur: a short arm segment through the Sun's position */
  spur: { rKpc: 8.35, fromDeg: -22, toDeg: 18, weight: 0.45 },
} as const;

export const KPC_LY = 3261.563_777;
