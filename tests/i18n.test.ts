import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { de } from '../src/i18n/de';
import { BODIES } from '../src/data/bodies';
import { INTERIORS } from '../src/data/interiors';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('i18n', () => {
  it('has the same keys in German and English', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });
  it('uses the same placeholders in both languages', () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(placeholders(de[k]), k).toBe(placeholders(en[k]));
  });
  it('names and describes every body', () => {
    for (const b of BODIES) {
      expect(en, b.key).toHaveProperty(`body.${b.key}`);
      expect(en, b.key).toHaveProperty(`blurb.${b.key}`);
    }
  });
  it('names every interior layer', () => {
    for (const i of Object.values(INTERIORS)) for (const l of i.layers) expect(en, l.key).toHaveProperty(`layer.${l.key}`);
  });
});

describe('interiors', () => {
  it('have strictly increasing radii ending at the body radius', () => {
    for (const i of Object.values(INTERIORS)) {
      const r = i.layers.map((l) => l.outerKm);
      for (let k = 1; k < r.length; k++) expect(r[k], `${i.body} layer ${k}`).toBeGreaterThan(r[k - 1]);
      const body = BODIES.find((b) => b.key === i.body)!;
      expect(Math.abs(r[r.length - 1] - body.radiusKm) / body.radiusKm, i.body).toBeLessThan(0.002);
    }
  });
});
