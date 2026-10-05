/**
 * The body catalogue.
 *
 * Sources (full list in sources.ts):
 *  - GM: JPL DE440 (Park et al. 2021, AJ 161:105, table 8), km³/s². Planet entries 4–9 are
 *    system values (planet + moons), matching the Horizons barycentres used as states.
 *  - Radii, rotation elements: IAU WGCCRE 2015 (Archinal et al. 2018, Celest. Mech. Dyn. Astr. 130:22).
 *  - Physical and orbital facts: NASA Planetary Fact Sheets (D. R. Williams, NSSDCA).
 */

export type BodyKind = 'star' | 'planet' | 'dwarf' | 'moon' | 'comet' | 'spacecraft';

/** IAU rotation model: angles in degrees, d = days since J2000 TDB, T = Julian centuries. */
export interface RotationModel {
  ra0: number;
  ra1?: number; // per century
  dec0: number;
  dec1?: number; // per century
  w0: number;
  wd: number; // degrees per day
  /** Neptune's pole and spin carry a precession term in N = 357.85 + 52.316 T. */
  neptuneTerms?: boolean;
}

export interface Texture {
  /** file base in public/textures; resolved to _2k / _4k (or used as is when fixed) */
  base: string;
  sizes: ('1k' | '2k' | '4k' | 'zonal')[];
  /** east longitude of the left image edge, degrees */
  lon0?: number;
}

export interface Facts {
  massKg: number;
  densityKgM3?: number;
  gravityMs2?: number;
  escapeKms?: number;
  /** sidereal rotation in hours; negative = retrograde */
  rotationH?: number;
  /** length of the solar day in hours */
  dayH?: number;
  obliquityDeg?: number;
  /** orbital period in days */
  periodD?: number;
  aAu?: number;
  aKm?: number; // moons: semi-major axis around the planet
  ecc?: number;
  inclDeg?: number;
  meanTempC?: number;
  pressureBar?: number;
  discovered?: { year: number; by: string };
}

export interface BodyDef {
  key: string;
  kind: BodyKind;
  parent?: string;
  /** key of the Horizons state used by the integrator, if any */
  stateKey?: string;
  /** GM in km³/s² (0 = massless test particle) */
  gm: number;
  radiusKm: number;
  /** equatorial and polar radius for oblate bodies */
  eqKm?: number;
  polarKm?: number;
  rotation?: RotationModel;
  /** tidally locked moons keep their prime meridian toward the planet */
  locked?: boolean;
  texture?: Texture;
  /** alternative mission-data layer shown in the plate (e.g. Mercury false colour) */
  altTexture?: { base: string; labelKey: string };
  /** procedural surface for bodies without a usable global map */
  procedural?: 'sun' | 'venus-clouds' | 'rock' | 'ice';
  atmosphere?: { color: [number, number, number]; strength: number; heightKm: number };
  clouds?: string;
  night?: string;
  ocean?: string;
  /** colour of the atlas marker and orbit line */
  ink: string;
  facts?: Facts;
  /** how much of this entry is measured vs illustrative (shown in the plate) */
  provenance: 'data' | 'mixed' | 'illustrative';
}

const PLANET_INK = {
  mercury: '#b8ada0',
  venus: '#e8d3a8',
  earth: '#7fb6d9',
  mars: '#d9795a',
  jupiter: '#d8b48a',
  saturn: '#e3cf9a',
  uranus: '#9fd6dc',
  neptune: '#7d9fe0',
};

export const BODIES: BodyDef[] = [
  {
    key: 'sun',
    kind: 'star',
    stateKey: 'sun',
    gm: 132_712_440_041.279_419,
    radiusKm: 695_700,
    rotation: { ra0: 286.13, dec0: 63.87, w0: 84.176, wd: 14.184_4 },
    procedural: 'sun',
    ink: '#ffd27a',
    provenance: 'mixed',
    facts: { massKg: 1.988_4e30, densityKgM3: 1408, gravityMs2: 274, escapeKms: 617.7, rotationH: 25.38 * 24, meanTempC: 5772 - 273.15 },
  },
  {
    key: 'mercury',
    kind: 'planet',
    stateKey: 'mercury',
    gm: 22_031.868_551,
    radiusKm: 2439.7,
    rotation: { ra0: 281.0103, ra1: -0.0328, dec0: 61.4155, dec1: -0.0049, w0: 329.5988, wd: 6.138_510_8 },
    texture: { base: 'mercury', sizes: ['2k', '4k'] },
    altTexture: { base: 'mercury_falsecolour_2k', labelKey: 'layer.falsecolour' },
    ink: PLANET_INK.mercury,
    provenance: 'data',
    facts: { massKg: 0.330_11e24, densityKgM3: 5429, gravityMs2: 3.7, escapeKms: 4.3, rotationH: 1407.6, dayH: 4222.6, obliquityDeg: 0.034, periodD: 87.969, aAu: 0.387_098, ecc: 0.2056, inclDeg: 7.0, meanTempC: 167, pressureBar: 0 },
  },
  {
    key: 'venus',
    kind: 'planet',
    stateKey: 'venus',
    gm: 324_858.592,
    radiusKm: 6051.8,
    rotation: { ra0: 272.76, dec0: 67.16, w0: 160.2, wd: -1.481_368_8 },
    procedural: 'venus-clouds',
    altTexture: { base: 'venus_radar_2k', labelKey: 'layer.radar' },
    atmosphere: { color: [1.0, 0.86, 0.6], strength: 1.2, heightKm: 250 },
    ink: PLANET_INK.venus,
    provenance: 'mixed',
    facts: { massKg: 4.8675e24, densityKgM3: 5243, gravityMs2: 8.9, escapeKms: 10.4, rotationH: -5832.5, dayH: 2802.0, obliquityDeg: 177.4, periodD: 224.701, aAu: 0.723_332, ecc: 0.0068, inclDeg: 3.39, meanTempC: 464, pressureBar: 92 },
  },
  {
    key: 'earth',
    kind: 'planet',
    stateKey: 'earth',
    gm: 398_600.435_507,
    radiusKm: 6371.0,
    eqKm: 6378.137,
    polarKm: 6356.752,
    rotation: { ra0: 0, ra1: -0.641, dec0: 90, dec1: -0.557, w0: 190.147, wd: 360.985_623_5 },
    texture: { base: 'earth_day', sizes: ['2k', '4k'] },
    night: 'earth_night',
    clouds: 'earth_clouds_2k',
    ocean: 'earth_ocean_2k',
    atmosphere: { color: [0.32, 0.56, 1.0], strength: 1.0, heightKm: 120 },
    ink: PLANET_INK.earth,
    provenance: 'data',
    facts: { massKg: 5.9722e24, densityKgM3: 5514, gravityMs2: 9.81, escapeKms: 11.19, rotationH: 23.9345, dayH: 24.0, obliquityDeg: 23.44, periodD: 365.256, aAu: 1.000_001, ecc: 0.0167, inclDeg: 0.0, meanTempC: 15, pressureBar: 1.014 },
  },
  {
    key: 'moon',
    kind: 'moon',
    parent: 'earth',
    stateKey: 'moon',
    gm: 4902.800_118,
    radiusKm: 1737.4,
    rotation: { ra0: 269.9949, ra1: 0.0031, dec0: 66.5392, dec1: 0.013, w0: 38.3213, wd: 13.176_358_15 },
    texture: { base: 'moon', sizes: ['2k', '4k'] },
    ink: '#d6d2c8',
    provenance: 'data',
    facts: { massKg: 0.07346e24, densityKgM3: 3344, gravityMs2: 1.62, escapeKms: 2.38, rotationH: 655.72, dayH: 708.7, obliquityDeg: 6.68, periodD: 27.3217, aKm: 384_400, ecc: 0.0549, inclDeg: 5.145, meanTempC: -20, pressureBar: 0 },
  },
  {
    key: 'mars',
    kind: 'planet',
    stateKey: 'mars',
    gm: 42_828.375_816,
    radiusKm: 3389.5,
    eqKm: 3396.19,
    polarKm: 3376.2,
    rotation: { ra0: 317.269_202, ra1: -0.109_275_47, dec0: 54.432_516, dec1: -0.058_271_05, w0: 176.049_863, wd: 350.891_982_443_297 },
    texture: { base: 'mars', sizes: ['2k', '4k'] },
    atmosphere: { color: [0.95, 0.62, 0.45], strength: 0.45, heightKm: 80 },
    ink: PLANET_INK.mars,
    provenance: 'data',
    facts: { massKg: 0.641_71e24, densityKgM3: 3934, gravityMs2: 3.73, escapeKms: 5.03, rotationH: 24.6229, dayH: 24.6597, obliquityDeg: 25.19, periodD: 686.98, aAu: 1.523_679, ecc: 0.0934, inclDeg: 1.85, meanTempC: -65, pressureBar: 0.006 },
  },
  {
    key: 'ceres',
    kind: 'dwarf',
    stateKey: 'ceres',
    gm: 62.6289,
    radiusKm: 469.7,
    rotation: { ra0: 291.418, dec0: 66.764, w0: 170.65, wd: 952.153_2 },
    procedural: 'rock',
    ink: '#a59d92',
    provenance: 'mixed',
    facts: { massKg: 9.38e20, densityKgM3: 2162, gravityMs2: 0.28, escapeKms: 0.51, rotationH: 9.074, obliquityDeg: 4, periodD: 1680, aAu: 2.767, ecc: 0.0785, inclDeg: 10.59, meanTempC: -105, discovered: { year: 1801, by: 'G. Piazzi' } },
  },
  {
    key: 'jupiter',
    kind: 'planet',
    stateKey: 'jupiter',
    gm: 126_712_764.1,
    radiusKm: 69_911,
    eqKm: 71_492,
    polarKm: 66_854,
    rotation: { ra0: 268.056_595, ra1: -0.006_499, dec0: 64.495_303, dec1: 0.002_413, w0: 284.95, wd: 870.536 },
    texture: { base: 'jupiter', sizes: ['2k', '4k'] },
    atmosphere: { color: [1.0, 0.9, 0.78], strength: 0.35, heightKm: 1500 },
    ink: PLANET_INK.jupiter,
    provenance: 'data',
    facts: { massKg: 1898.13e24, densityKgM3: 1326, gravityMs2: 24.79, escapeKms: 59.5, rotationH: 9.925, dayH: 9.926, obliquityDeg: 3.13, periodD: 4332.59, aAu: 5.2038, ecc: 0.0489, inclDeg: 1.3, meanTempC: -110 },
  },
  {
    key: 'saturn',
    kind: 'planet',
    stateKey: 'saturn',
    gm: 37_940_584.841_8,
    radiusKm: 58_232,
    eqKm: 60_268,
    polarKm: 54_364,
    rotation: { ra0: 40.589, ra1: -0.036, dec0: 83.537, dec1: -0.004, w0: 38.9, wd: 810.793_902_4 },
    texture: { base: 'saturn', sizes: ['zonal'] },
    atmosphere: { color: [1.0, 0.92, 0.75], strength: 0.3, heightKm: 1500 },
    ink: PLANET_INK.saturn,
    provenance: 'mixed',
    facts: { massKg: 568.32e24, densityKgM3: 687, gravityMs2: 10.44, escapeKms: 35.5, rotationH: 10.656, dayH: 10.656, obliquityDeg: 26.73, periodD: 10_759.22, aAu: 9.5826, ecc: 0.0565, inclDeg: 2.49, meanTempC: -140 },
  },
  {
    key: 'uranus',
    kind: 'planet',
    stateKey: 'uranus',
    gm: 5_794_556.4,
    radiusKm: 25_362,
    eqKm: 25_559,
    polarKm: 24_973,
    rotation: { ra0: 257.311, dec0: -15.175, w0: 203.81, wd: -501.160_092_8 },
    texture: { base: 'uranus', sizes: ['zonal'] },
    atmosphere: { color: [0.7, 0.92, 0.95], strength: 0.45, heightKm: 1200 },
    ink: PLANET_INK.uranus,
    provenance: 'mixed',
    facts: { massKg: 86.811e24, densityKgM3: 1270, gravityMs2: 8.87, escapeKms: 21.3, rotationH: -17.24, dayH: 17.24, obliquityDeg: 97.77, periodD: 30_688.5, aAu: 19.191, ecc: 0.0457, inclDeg: 0.77, meanTempC: -195, discovered: { year: 1781, by: 'W. Herschel' } },
  },
  {
    key: 'neptune',
    kind: 'planet',
    stateKey: 'neptune',
    gm: 6_836_527.100_58,
    radiusKm: 24_622,
    eqKm: 24_764,
    polarKm: 24_341,
    rotation: { ra0: 299.36, dec0: 43.46, w0: 249.978, wd: 541.139_775_7, neptuneTerms: true },
    texture: { base: 'neptune', sizes: ['zonal'] },
    atmosphere: { color: [0.5, 0.68, 1.0], strength: 0.5, heightKm: 1200 },
    ink: PLANET_INK.neptune,
    provenance: 'mixed',
    facts: { massKg: 102.409e24, densityKgM3: 1638, gravityMs2: 11.15, escapeKms: 23.5, rotationH: 16.11, dayH: 16.11, obliquityDeg: 28.32, periodD: 60_195, aAu: 30.07, ecc: 0.0113, inclDeg: 1.77, meanTempC: -200, discovered: { year: 1846, by: 'J. G. Galle · U. Le Verrier' } },
  },
  {
    key: 'pluto',
    kind: 'dwarf',
    stateKey: 'pluto',
    gm: 975.5,
    radiusKm: 1188.3,
    rotation: { ra0: 132.993, dec0: -6.163, w0: 302.695, wd: 56.362_522_5 },
    texture: { base: 'pluto', sizes: ['2k', '4k'], lon0: 0 },
    atmosphere: { color: [0.6, 0.75, 1.0], strength: 0.07, heightKm: 60 },
    ink: '#d9b99a',
    provenance: 'mixed',
    facts: { massKg: 1.303e22, densityKgM3: 1854, gravityMs2: 0.62, escapeKms: 1.21, rotationH: -153.29, dayH: 153.28, obliquityDeg: 122.53, periodD: 90_560, aAu: 39.48, ecc: 0.2488, inclDeg: 17.16, meanTempC: -225, pressureBar: 0.000_01, discovered: { year: 1930, by: 'C. Tombaugh' } },
  },
  // --- moons (positions from Horizons osculating elements, propagated as Kepler orbits) ---
  { key: 'phobos', kind: 'moon', parent: 'mars', gm: 0, radiusKm: 11.08, locked: true, texture: { base: 'phobos', sizes: ['1k'] }, ink: '#a99c8c', provenance: 'data', facts: { massKg: 1.0659e16, periodD: 0.318_91, aKm: 9376, discovered: { year: 1877, by: 'A. Hall' } } },
  { key: 'deimos', kind: 'moon', parent: 'mars', gm: 0, radiusKm: 6.2, locked: true, texture: { base: 'deimos', sizes: ['1k'] }, ink: '#a99c8c', provenance: 'data', facts: { massKg: 1.4762e15, periodD: 1.262_44, aKm: 23_458, discovered: { year: 1877, by: 'A. Hall' } } },
  { key: 'io', kind: 'moon', parent: 'jupiter', gm: 0, radiusKm: 1821.6, locked: true, texture: { base: 'io', sizes: ['1k'] }, ink: '#e8d36a', provenance: 'data', facts: { massKg: 8.9319e22, periodD: 1.769_14, aKm: 421_800, discovered: { year: 1610, by: 'Galileo Galilei' } } },
  { key: 'europa', kind: 'moon', parent: 'jupiter', gm: 0, radiusKm: 1560.8, locked: true, texture: { base: 'europa', sizes: ['1k'] }, ink: '#d9c9b0', provenance: 'data', facts: { massKg: 4.7998e22, periodD: 3.551_18, aKm: 671_100, discovered: { year: 1610, by: 'Galileo Galilei' } } },
  { key: 'ganymede', kind: 'moon', parent: 'jupiter', gm: 0, radiusKm: 2634.1, locked: true, texture: { base: 'ganymede', sizes: ['1k'] }, ink: '#b7aa98', provenance: 'data', facts: { massKg: 1.4819e23, periodD: 7.154_55, aKm: 1_070_400, discovered: { year: 1610, by: 'Galileo Galilei' } } },
  { key: 'callisto', kind: 'moon', parent: 'jupiter', gm: 0, radiusKm: 2410.3, locked: true, texture: { base: 'callisto', sizes: ['1k'] }, ink: '#8f8578', provenance: 'data', facts: { massKg: 1.0759e23, periodD: 16.689, aKm: 1_882_700, discovered: { year: 1610, by: 'Galileo Galilei' } } },
  { key: 'enceladus', kind: 'moon', parent: 'saturn', gm: 0, radiusKm: 252.1, locked: true, texture: { base: 'enceladus', sizes: ['1k'] }, ink: '#eef3f5', provenance: 'data', facts: { massKg: 1.08e20, periodD: 1.370_22, aKm: 238_040, discovered: { year: 1789, by: 'W. Herschel' } } },
  { key: 'rhea', kind: 'moon', parent: 'saturn', gm: 0, radiusKm: 763.8, locked: true, texture: { base: 'rhea', sizes: ['1k'] }, ink: '#cfcac2', provenance: 'data', facts: { massKg: 2.306e21, periodD: 4.518, aKm: 527_108, discovered: { year: 1672, by: 'G. D. Cassini' } } },
  { key: 'titan', kind: 'moon', parent: 'saturn', gm: 0, radiusKm: 2574.7, locked: true, texture: { base: 'titan', sizes: ['1k'] }, atmosphere: { color: [1.0, 0.68, 0.3], strength: 1.1, heightKm: 600 }, ink: '#e0a35a', provenance: 'data', facts: { massKg: 1.3452e23, periodD: 15.945, aKm: 1_221_870, pressureBar: 1.47, meanTempC: -179, discovered: { year: 1655, by: 'C. Huygens' } } },
  { key: 'titania', kind: 'moon', parent: 'uranus', gm: 0, radiusKm: 788.9, locked: true, texture: { base: 'titania', sizes: ['1k'] }, ink: '#bdb3a8', provenance: 'data', facts: { massKg: 3.4e21, periodD: 8.706, aKm: 435_910, discovered: { year: 1787, by: 'W. Herschel' } } },
  { key: 'oberon', kind: 'moon', parent: 'uranus', gm: 0, radiusKm: 761.4, locked: true, texture: { base: 'oberon', sizes: ['1k'] }, ink: '#a99f95', provenance: 'data', facts: { massKg: 3.076e21, periodD: 13.463, aKm: 583_520, discovered: { year: 1787, by: 'W. Herschel' } } },
  { key: 'triton', kind: 'moon', parent: 'neptune', gm: 0, radiusKm: 1353.4, locked: true, texture: { base: 'triton', sizes: ['1k'] }, ink: '#d8cfc6', provenance: 'data', facts: { massKg: 2.139e22, periodD: 5.877, aKm: 354_759, meanTempC: -235, discovered: { year: 1846, by: 'W. Lassell' } } },
  { key: 'charon', kind: 'moon', parent: 'pluto', gm: 0, radiusKm: 606, locked: true, texture: { base: 'charon', sizes: ['2k', '4k'], lon0: 0 }, ink: '#b8b0a8', provenance: 'data', facts: { massKg: 1.586e21, periodD: 6.387, aKm: 19_591, discovered: { year: 1978, by: 'J. W. Christy' } } },
  // --- small bodies and spacecraft (massless test particles in the integrator) ---
  { key: 'halley', kind: 'comet', stateKey: 'halley', gm: 0, radiusKm: 5.5, procedural: 'rock', ink: '#9fe3d0', provenance: 'data', facts: { massKg: 2.2e14, periodD: 27_510, aAu: 17.8, ecc: 0.967, inclDeg: 162.3, discovered: { year: 1758, by: 'E. Halley (predicted)' } } },
  { key: 'voyager1', kind: 'spacecraft', stateKey: 'voyager1', gm: 0, radiusKm: 0.002, ink: '#ff6a3d', provenance: 'data', facts: { massKg: 825.5 } },
  { key: 'voyager2', kind: 'spacecraft', stateKey: 'voyager2', gm: 0, radiusKm: 0.002, ink: '#ff6a3d', provenance: 'data', facts: { massKg: 825.5 } },
  { key: 'newhorizons', kind: 'spacecraft', stateKey: 'newhorizons', gm: 0, radiusKm: 0.002, ink: '#ff6a3d', provenance: 'data', facts: { massKg: 478 } },
];

export const BODY: Record<string, BodyDef> = Object.fromEntries(BODIES.map((b) => [b.key, b]));

/** Bodies that have Horizons states and enter the N-body integration, massive ones first. */
export const INTEGRATED = BODIES.filter((b) => b.stateKey).sort((a, b) => Number(b.gm > 0) - Number(a.gm > 0));

/** Mass ratio Charon/Pluto (Brozović et al. 2015): the barycentre of the pair lies outside Pluto. */
export const CHARON_PLUTO_MASS_RATIO = 0.1218;

/** Display order of the body index. */
export const INDEX_GROUPS: { key: string; members: string[] }[] = [
  { key: 'group.star', members: ['sun'] },
  { key: 'group.planets', members: ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] },
  { key: 'group.dwarfs', members: ['ceres', 'pluto'] },
  { key: 'group.moons', members: ['moon', 'phobos', 'deimos', 'io', 'europa', 'ganymede', 'callisto', 'enceladus', 'rhea', 'titan', 'titania', 'oberon', 'triton', 'charon'] },
  { key: 'group.travellers', members: ['halley', 'voyager1', 'voyager2', 'newhorizons'] },
];
