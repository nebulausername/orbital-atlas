/**
 * Ring systems. Boundaries in km from the planet centre; tau = typical normal optical
 * depth, used for opacity. Saturn: boundaries and optical depths after the NASA Saturn
 * ring fact sheet and Cassini UVIS/VIMS occultation summaries (Colwell et al. 2009,
 * in "Saturn from Cassini-Huygens"). Fine structure inside the bands is illustrative.
 */

export interface RingBand {
  key: string;
  innerKm: number;
  outerKm: number;
  tau: number;
  /** reflectance tint */
  color: [number, number, number];
  /** strength of illustrative fine structure (0 = smooth) */
  grain: number;
}

export interface RingSystem {
  planet: string;
  bands: RingBand[];
  /** overall brightness multiplier */
  brightness: number;
}

export const RINGS: Record<string, RingSystem> = {
  saturn: {
    planet: 'saturn',
    brightness: 1,
    bands: [
      { key: 'D', innerKm: 66_900, outerKm: 74_510, tau: 0.002, color: [0.7, 0.66, 0.62], grain: 0.4 },
      { key: 'C', innerKm: 74_658, outerKm: 92_000, tau: 0.1, color: [0.66, 0.62, 0.58], grain: 0.6 },
      { key: 'B', innerKm: 92_000, outerKm: 117_580, tau: 2.0, color: [0.92, 0.84, 0.7], grain: 0.5 },
      { key: 'Cassini Division', innerKm: 117_580, outerKm: 122_170, tau: 0.12, color: [0.55, 0.52, 0.5], grain: 0.5 },
      { key: 'A', innerKm: 122_170, outerKm: 133_423, tau: 0.5, color: [0.86, 0.8, 0.7], grain: 0.35 },
      { key: 'Encke Gap', innerKm: 133_423, outerKm: 133_745, tau: 0.0, color: [0, 0, 0], grain: 0 },
      { key: 'A', innerKm: 133_745, outerKm: 136_522, tau: 0.45, color: [0.84, 0.78, 0.68], grain: 0.3 },
      { key: 'Keeler Gap', innerKm: 136_522, outerKm: 136_564, tau: 0.0, color: [0, 0, 0], grain: 0 },
      { key: 'A', innerKm: 136_564, outerKm: 136_775, tau: 0.4, color: [0.84, 0.78, 0.68], grain: 0.2 },
      { key: 'F', innerKm: 140_130, outerKm: 140_230, tau: 0.5, color: [0.9, 0.86, 0.8], grain: 0 },
      { key: 'G', innerKm: 166_000, outerKm: 175_000, tau: 0.000_001_5, color: [0.7, 0.68, 0.66], grain: 0 },
    ],
  },
  uranus: {
    planet: 'uranus',
    brightness: 0.35,
    bands: [
      { key: '6–δ', innerKm: 41_837, outerKm: 48_300, tau: 0.02, color: [0.45, 0.45, 0.47], grain: 0.9 },
      { key: 'ε', innerKm: 51_120, outerKm: 51_178, tau: 1.2, color: [0.55, 0.55, 0.57], grain: 0 },
    ],
  },
  jupiter: {
    planet: 'jupiter',
    brightness: 0.25,
    bands: [
      { key: 'Halo', innerKm: 92_000, outerKm: 122_500, tau: 0.000_001, color: [0.75, 0.62, 0.5], grain: 0 },
      { key: 'Main', innerKm: 122_500, outerKm: 129_000, tau: 0.000_005_9, color: [0.8, 0.66, 0.52], grain: 0 },
    ],
  },
  neptune: {
    planet: 'neptune',
    brightness: 0.3,
    bands: [
      { key: 'Le Verrier', innerKm: 53_150, outerKm: 53_250, tau: 0.002, color: [0.5, 0.5, 0.55], grain: 0 },
      { key: 'Adams', innerKm: 62_900, outerKm: 62_950, tau: 0.004, color: [0.5, 0.5, 0.55], grain: 0 },
    ],
  },
};
