import { describe, expect, it } from 'vitest';
import { Simulation, EPOCH_JD } from '../src/physics/simulation';
import { elementsFromState, positionAt, eccentricAnomaly } from '../src/physics/kepler';
import { orientation } from '../src/physics/rotation';
import { BODY } from '../src/data/bodies';
import { AU_KM, jdFromUnixMs, DEG } from '../src/core/units';
import { dot, eclToScene, norm } from '../src/physics/frames';
import validation from '../src/data/generated/horizons-validation.json';

type State = { jd: number; r: number[]; v: number[] };
const dates = validation.dates as Record<string, Record<string, State>>;

function errorsKm(sim: Simulation, ref: Record<string, State>) {
  const out: Record<string, number> = {};
  for (const [key, s] of Object.entries(ref)) {
    // Horizons gives the Pluto system barycentre; the simulation splits it with Charon.
    const p = key === 'pluto' ? sim.pos.get('pluto-barycentre')! : sim.pos.get(key)!;
    out[key] = Math.hypot(p[0] - s.r[0], p[1] - s.r[1], p[2] - s.r[2]) * AU_KM;
  }
  return out;
}

describe('N-body integration against JPL Horizons (DE441)', () => {
  // Measured at dt = 1.5 h after ±10 years: Earth/Venus ~1 km, Mars 3 km, Mercury 4 km,
  // giants < 10 km, Moon ~200 km (no lunar figure/tides in a point-mass model).
  const limitsKm: Record<string, number> = {
    sun: 10,
    mercury: 50,
    venus: 20,
    earth: 20,
    moon: 1_000,
    mars: 20,
    jupiter: 50,
    saturn: 50,
    uranus: 50,
    neptune: 50,
    pluto: 100,
    ceres: 500,
    halley: 100,
  };

  for (const date of ['2036-01-01', '2016-01-01']) {
    it(`matches Horizons on ${date}`, async () => {
      const sim = new Simulation();
      const ref = dates[date];
      await sim.seek(ref.sun.jd);
      const err = errorsKm(sim, ref);
      console.log(`errors after ${((ref.sun.jd - EPOCH_JD) / 365.25).toFixed(1)} years (km):`, Object.fromEntries(Object.entries(err).map(([k, v]) => [k, Math.round(v)])));
      for (const [k, v] of Object.entries(err)) expect(v, k).toBeLessThan(limitsKm[k]);
    }, 60_000);
  }

  it('stays bounded over 50 years (2076)', async () => {
    const sim = new Simulation();
    const ref = dates['2076-01-01'];
    await sim.seek(ref.sun.jd);
    const err = errorsKm(sim, ref);
    console.log('errors after 50 years (km):', Object.fromEntries(Object.entries(err).map(([k, v]) => [k, Math.round(v)])));
    // angular error as seen from the Sun, in arcseconds
    for (const k of ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) {
      const arcsec = (err[k] / (sim.sunDistance(k) * AU_KM)) / DEG * 3600;
      expect(arcsec, k).toBeLessThan(1);
    }
  }, 120_000);

  it('conserves energy (Newtonian, symplectic)', async () => {
    const sim = new Simulation();
    sim.nbody.relativity = false;
    await sim.seek(EPOCH_JD + 100 * 365.25);
    expect(Math.abs(sim.nbody.energyDrift())).toBeLessThan(1e-9);
  }, 120_000);

  it('is time-reversible', async () => {
    const sim = new Simulation();
    const start = sim.nbody.snapshot();
    await sim.seek(EPOCH_JD + 20 * 365.25);
    await sim.seek(EPOCH_JD);
    let maxKm = 0;
    for (let i = 0; i < sim.nbody.n * 3; i++) maxKm = Math.max(maxKm, Math.abs(sim.nbody.r[i] - start.r[i]) * AU_KM);
    expect(maxKm).toBeLessThan(1);
  }, 120_000);
});

describe('Kepler', () => {
  it('solves Kepler’s equation for high eccentricity', () => {
    for (const e of [0, 0.3, 0.9, 0.967]) {
      for (const M of [-3, -0.1, 0.001, 1, 2.5, 3.1]) {
        const E = eccentricAnomaly(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 10);
      }
    }
  });

  it('round-trips state → elements → state', () => {
    const mu = 0.000_295_912_208; // GM_sun in AU³/d²
    const r: [number, number, number] = [0.3, -1.1, 0.05];
    const v: [number, number, number] = [0.015, 0.004, 0.0009];
    const el = elementsFromState(r, v, mu);
    const p = positionAt(el);
    expect(p[0]).toBeCloseTo(r[0], 9);
    expect(p[1]).toBeCloseTo(r[1], 9);
    expect(p[2]).toBeCloseTo(r[2], 9);
  });
});

describe('Rotation (IAU WGCCRE)', () => {
  it('puts the subsolar point near Greenwich at noon on the March equinox', () => {
    const sim = new Simulation();
    const jd = jdFromUnixMs(Date.UTC(2026, 2, 20, 12, 0, 0));
    sim.nbody.advanceToward(jd);
    sim.jd = jd;
    sim.refresh();
    const o = orientation(BODY.earth.rotation!, jd);
    const e = sim.pos.get('earth')!, s = sim.pos.get('sun')!;
    const dir = norm(eclToScene([s[0] - e[0], s[1] - e[1], s[2] - e[2]]));
    const lon = Math.atan2(dot(dir, o.east), dot(dir, o.prime)) / DEG;
    const lat = Math.asin(dot(dir, o.pole)) / DEG;
    // apparent noon at Greenwich is ~12:07 UTC (equation of time ≈ −7.5 min) → ~1.9° E
    expect(Math.abs(lon - 1.9)).toBeLessThan(1);
    expect(Math.abs(lat)).toBeLessThan(0.5);
  });
});

describe('the colophon tells the truth', () => {
  // The accuracy paragraph in both languages quotes these numbers. If the integrator
  // or its step size changes, this test fails before the text can go stale.
  it('quotes accuracy figures that the simulation actually meets', async () => {
    const { en } = await import('../src/i18n/en');
    const { de } = await import('../src/i18n/de');
    for (const text of [en['colophon.accuracy.body'], de['colophon.accuracy.body']]) {
      for (const n of ['1 km', '3 km', '4 km', '10 km', '200 km']) expect(text).toContain(n);
    }
    const sim = new Simulation();
    const ref = dates['2036-01-01'];
    await sim.seek(ref.sun.jd);
    const err = errorsKm(sim, ref);
    expect(err.earth).toBeLessThan(1.5);
    expect(err.venus).toBeLessThan(1.5);
    expect(err.mars).toBeLessThan(3.5);
    expect(err.mercury).toBeLessThan(4.5);
    for (const k of ['jupiter', 'saturn', 'uranus', 'neptune']) expect(err[k], k).toBeLessThan(10);
    expect(err.moon).toBeLessThan(250);
  }, 120_000);
});
