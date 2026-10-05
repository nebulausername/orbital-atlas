/**
 * Interior models for the cutaways. Radii are the OUTER radius of each layer in km,
 * innermost first. `basis` says how we know:
 *   seismic  – measured with seismometers (Earth, Moon, Mars)
 *   geodetic – inferred from gravity field, rotation, libration or tides
 *   model    – theoretical model consistent with mass, radius and gravity, no direct probe
 * Layer radii are to scale; the colours of the cut faces are a legend, not appearance.
 */

export type Basis = 'seismic' | 'geodetic' | 'model';
export type Phase = 'solid' | 'liquid' | 'partial' | 'fluid' | 'plasma' | 'gas';

export interface Layer {
  key: string; // i18n: layer.<key>
  outerKm: number;
  phase: Phase;
  color: string;
  basis: Basis;
  /** density range g/cm³ */
  density?: [number, number];
  /** temperature range °C */
  tempC?: [number, number];
  /** reference ids from sources.ts */
  refs: string[];
}

export interface Interior {
  body: string;
  layers: Layer[];
  /** i18n key of a short caveat shown under the cutaway */
  caveat?: string;
}

const C = {
  ironSolid: '#f0c879',
  ironLiquid: '#e39a5c',
  silicateHot: '#c7735a',
  silicate: '#9b5b49',
  crust: '#8a7a68',
  molten: '#e07b4f',
  ocean: '#4f86b5',
  ice: '#c9dfe6',
  metallicH: '#8c83c4',
  molecularH: '#cdb48d',
  ices: '#5aa6b4',
  rock: '#9c8064',
  cloud: '#efe3c8',
  plasmaCore: '#fff0bf',
  plasmaRad: '#ffcd70',
  plasmaConv: '#ff9a52',
};

export const INTERIORS: Record<string, Interior> = {
  sun: {
    body: 'sun',
    caveat: 'caveat.sun',
    layers: [
      { key: 'sun-core', outerKm: 0.25 * 695_700, phase: 'plasma', color: C.plasmaCore, basis: 'seismic', density: [20, 150], tempC: [7e6, 1.57e7], refs: ['bahcall2005', 'cd1991'] },
      { key: 'radiative', outerKm: 0.713 * 695_700, phase: 'plasma', color: C.plasmaRad, basis: 'seismic', density: [0.2, 20], tempC: [2e6, 7e6], refs: ['cd1991'] },
      { key: 'convective', outerKm: 695_700, phase: 'plasma', color: C.plasmaConv, basis: 'seismic', density: [2e-7, 0.2], tempC: [5500, 2e6], refs: ['cd1991'] },
    ],
  },
  mercury: {
    body: 'mercury',
    caveat: 'caveat.mercury',
    layers: [
      { key: 'inner-core', outerKm: 1000, phase: 'solid', color: C.ironSolid, basis: 'geodetic', refs: ['genova2019'] },
      { key: 'outer-core', outerKm: 2020, phase: 'liquid', color: C.ironLiquid, basis: 'geodetic', refs: ['hauck2013'] },
      { key: 'mantle', outerKm: 2404, phase: 'solid', color: C.silicate, basis: 'geodetic', refs: ['hauck2013'] },
      { key: 'crust', outerKm: 2439.7, phase: 'solid', color: C.crust, basis: 'geodetic', refs: ['padovan2015'] },
    ],
  },
  venus: {
    body: 'venus',
    caveat: 'caveat.venus',
    layers: [
      { key: 'core', outerKm: 3000, phase: 'liquid', color: C.ironLiquid, basis: 'model', refs: ['nssdc'] },
      { key: 'mantle', outerKm: 6021, phase: 'solid', color: C.silicate, basis: 'model', refs: ['nssdc'] },
      { key: 'crust', outerKm: 6051.8, phase: 'solid', color: C.crust, basis: 'model', refs: ['nssdc'] },
    ],
  },
  earth: {
    body: 'earth',
    layers: [
      { key: 'inner-core', outerKm: 1221.5, phase: 'solid', color: C.ironSolid, basis: 'seismic', density: [12.76, 13.09], tempC: [5000, 5400], refs: ['prem'] },
      { key: 'outer-core', outerKm: 3480, phase: 'liquid', color: C.ironLiquid, basis: 'seismic', density: [9.9, 12.17], tempC: [4000, 5000], refs: ['prem'] },
      { key: 'lower-mantle', outerKm: 5701, phase: 'solid', color: C.silicateHot, basis: 'seismic', density: [4.38, 5.57], tempC: [1900, 4000], refs: ['prem'] },
      { key: 'upper-mantle', outerKm: 6346.6, phase: 'solid', color: C.silicate, basis: 'seismic', density: [3.3, 3.99], tempC: [500, 1900], refs: ['prem'] },
      { key: 'crust', outerKm: 6371, phase: 'solid', color: C.crust, basis: 'seismic', density: [2.6, 2.9], tempC: [15, 500], refs: ['prem'] },
    ],
  },
  moon: {
    body: 'moon',
    layers: [
      { key: 'inner-core', outerKm: 240, phase: 'solid', color: C.ironSolid, basis: 'seismic', refs: ['weber2011'] },
      { key: 'outer-core', outerKm: 330, phase: 'liquid', color: C.ironLiquid, basis: 'seismic', refs: ['weber2011'] },
      { key: 'partial-melt', outerKm: 480, phase: 'partial', color: C.molten, basis: 'seismic', refs: ['weber2011'] },
      { key: 'mantle', outerKm: 1697, phase: 'solid', color: C.silicate, basis: 'seismic', refs: ['weber2011'] },
      { key: 'crust', outerKm: 1737.4, phase: 'solid', color: C.crust, basis: 'geodetic', density: [2.55, 2.55], refs: ['wieczorek2013'] },
    ],
  },
  mars: {
    body: 'mars',
    caveat: 'caveat.mars',
    layers: [
      { key: 'core', outerKm: 1650, phase: 'liquid', color: C.ironLiquid, basis: 'seismic', density: [6.0, 6.5], refs: ['samuel2023', 'khan2023'] },
      { key: 'molten-silicate', outerKm: 1800, phase: 'liquid', color: C.molten, basis: 'seismic', refs: ['samuel2023', 'khan2023'] },
      { key: 'mantle', outerKm: 3350, phase: 'solid', color: C.silicate, basis: 'seismic', refs: ['stahler2021'] },
      { key: 'crust', outerKm: 3389.5, phase: 'solid', color: C.crust, basis: 'seismic', refs: ['knapmeyer2021'] },
    ],
  },
  jupiter: {
    body: 'jupiter',
    caveat: 'caveat.giants',
    layers: [
      { key: 'dilute-core', outerKm: 0.4 * 69_911, phase: 'fluid', color: C.rock, basis: 'geodetic', refs: ['wahl2017', 'militzer2022'] },
      { key: 'metallic-h', outerKm: 0.8 * 69_911, phase: 'fluid', color: C.metallicH, basis: 'model', refs: ['wahl2017'] },
      { key: 'molecular-h', outerKm: 0.997 * 69_911, phase: 'fluid', color: C.molecularH, basis: 'model', refs: ['wahl2017'] },
      { key: 'clouds', outerKm: 69_911, phase: 'gas', color: C.cloud, basis: 'model', refs: ['nssdc'] },
    ],
  },
  saturn: {
    body: 'saturn',
    caveat: 'caveat.giants',
    layers: [
      { key: 'dilute-core', outerKm: 0.6 * 58_232, phase: 'fluid', color: C.rock, basis: 'geodetic', refs: ['mankovich2021'] },
      { key: 'metallic-h', outerKm: 0.66 * 58_232, phase: 'fluid', color: C.metallicH, basis: 'model', refs: ['mankovich2021'] },
      { key: 'molecular-h', outerKm: 0.997 * 58_232, phase: 'fluid', color: C.molecularH, basis: 'model', refs: ['mankovich2021'] },
      { key: 'clouds', outerKm: 58_232, phase: 'gas', color: C.cloud, basis: 'model', refs: ['nssdc'] },
    ],
  },
  uranus: {
    body: 'uranus',
    caveat: 'caveat.icegiants',
    layers: [
      { key: 'rocky-core', outerKm: 0.2 * 25_362, phase: 'solid', color: C.rock, basis: 'model', refs: ['helled2011'] },
      { key: 'icy-mantle', outerKm: 0.8 * 25_362, phase: 'fluid', color: C.ices, basis: 'model', refs: ['helled2011'] },
      { key: 'h-he-envelope', outerKm: 0.997 * 25_362, phase: 'gas', color: C.molecularH, basis: 'model', refs: ['helled2011'] },
      { key: 'clouds', outerKm: 25_362, phase: 'gas', color: C.cloud, basis: 'model', refs: ['nssdc'] },
    ],
  },
  neptune: {
    body: 'neptune',
    caveat: 'caveat.icegiants',
    layers: [
      { key: 'rocky-core', outerKm: 0.2 * 24_622, phase: 'solid', color: C.rock, basis: 'model', refs: ['helled2011'] },
      { key: 'icy-mantle', outerKm: 0.8 * 24_622, phase: 'fluid', color: C.ices, basis: 'model', refs: ['helled2011'] },
      { key: 'h-he-envelope', outerKm: 0.997 * 24_622, phase: 'gas', color: C.molecularH, basis: 'model', refs: ['helled2011'] },
      { key: 'clouds', outerKm: 24_622, phase: 'gas', color: C.cloud, basis: 'model', refs: ['nssdc'] },
    ],
  },
  pluto: {
    body: 'pluto',
    caveat: 'caveat.pluto',
    layers: [
      { key: 'rocky-core', outerKm: 850, phase: 'solid', color: C.rock, basis: 'model', refs: ['nimmo2016'] },
      { key: 'ocean', outerKm: 1030, phase: 'liquid', color: C.ocean, basis: 'geodetic', refs: ['nimmo2016'] },
      { key: 'ice-shell', outerKm: 1188.3, phase: 'solid', color: C.ice, basis: 'geodetic', refs: ['nimmo2016'] },
    ],
  },
  europa: {
    body: 'europa',
    caveat: 'caveat.europa',
    layers: [
      { key: 'core', outerKm: 600, phase: 'solid', color: C.ironLiquid, basis: 'geodetic', refs: ['anderson1998'] },
      { key: 'rock-mantle', outerKm: 1430, phase: 'solid', color: C.silicate, basis: 'geodetic', refs: ['anderson1998'] },
      { key: 'ocean', outerKm: 1540, phase: 'liquid', color: C.ocean, basis: 'geodetic', refs: ['anderson1998', 'kivelson2000'] },
      { key: 'ice-shell', outerKm: 1560.8, phase: 'solid', color: C.ice, basis: 'geodetic', refs: ['anderson1998'] },
    ],
  },
  enceladus: {
    body: 'enceladus',
    layers: [
      { key: 'rocky-core', outerKm: 190, phase: 'solid', color: C.rock, basis: 'geodetic', refs: ['iess2014', 'thomas2016'] },
      { key: 'ocean', outerKm: 230, phase: 'liquid', color: C.ocean, basis: 'geodetic', refs: ['iess2014', 'thomas2016'] },
      { key: 'ice-shell', outerKm: 252.1, phase: 'solid', color: C.ice, basis: 'geodetic', refs: ['thomas2016'] },
    ],
  },
};
