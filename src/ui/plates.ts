/**
 * Which "plate" of the atlas the camera is on, and what the scale badge must say.
 * The badge is computed from what is actually drawn, not from the toggle alone.
 */
import { BODY, INDEX_GROUPS } from '../data/bodies';
import { kmToAu } from '../core/units';
import type { Frame } from '../render/frame';
import type { BodiesLayer } from '../render/bodies';
import { ROMAN } from './dom';
import { fmt, t, tk, type Key } from '../i18n/i18n';

export type PlateId = 'galaxy' | 'neighbourhood' | 'oort' | 'heliosphere' | 'outer' | 'inner' | `body:${string}`;

const REGION_PLATES: PlateId[] = ['galaxy', 'neighbourhood', 'oort', 'heliosphere', 'outer', 'inner'];
const BODY_ORDER = INDEX_GROUPS.flatMap((g) => g.members);

export function plateNumber(id: PlateId): string {
  const i = REGION_PLATES.indexOf(id);
  if (i >= 0) return ROMAN[i + 1];
  const k = BODY_ORDER.indexOf(id.slice(5));
  return ROMAN[REGION_PLATES.length + 1 + k] ?? '—';
}

export function plateTitle(id: PlateId): string {
  if (id.startsWith('body:')) return tk(`body.${id.slice(5)}`);
  return t(`plate.${id}` as Key);
}

/** Largest moon distance per planet in AU (for the size of a "system" plate). */
const SYSTEM_AU: Record<string, number> = {};
for (const b of Object.values(BODY)) {
  if (b.kind === 'moon' && b.parent && b.facts?.aKm) SYSTEM_AU[b.parent] = Math.max(SYSTEM_AU[b.parent] ?? 0, kmToAu(b.facts.aKm));
}

export function currentPlate(f: Frame, sunDistLog: number): PlateId {
  if (f.logD > 8.3) return 'galaxy';
  if (sunDistLog > 5.2) return 'neighbourhood';
  if (sunDistLog > 3.2) return 'oort';
  if (sunDistLog > 1.95) return 'heliosphere';
  const key = f.focusKey;
  if (key && BODY[key]) {
    const b = BODY[key];
    const zone = Math.max(kmToAu(b.radiusKm) * (b.kind === 'star' ? 40 : 320), (SYSTEM_AU[key] ?? 0) * 2.2, b.kind === 'spacecraft' ? 0.02 : 0);
    if (10 ** f.logD < zone) return `body:${key}`;
  }
  return sunDistLog > 0.95 ? 'outer' : 'inner';
}

export interface Badge {
  mode: 'true' | 'illustrative' | 'model';
  label: string;
  detail: string;
  maxEnlarge: number;
}

export function badge(plate: PlateId, illusMode: boolean, bodies: BodiesLayer, focus: string | null = null): Badge {
  if (plate === 'galaxy' || plate === 'oort') {
    return { mode: 'model', label: `${t('scale.badge.model')} · ${t('scale.illustrative')}`, detail: t('scale.model.detail'), maxEnlarge: 1 };
  }
  let max = 1;
  for (const st of bodies.states.values()) {
    if (!st.onScreen || st.merged || st.def.kind === 'spacecraft') continue;
    // only what is actually drawn as a disc counts; markers are legend symbols
    if (st.px < 1.5) continue;
    max = Math.max(max, st.enlarge);
  }
  const fs = focus ? bodies.states.get(focus) : undefined;
  if (illusMode && max > 1.5 && fs && fs.enlarge < 1.05 && fs.px > 30) {
    const name = tk(`body.${focus}`);
    return { mode: 'true', label: t('scale.focusTrue', { name }), detail: t('scale.focusTrue.detail', { name, p: fmt(max, 0) }), maxEnlarge: max };
  }
  if (illusMode && max > 1.5) {
    const p = fmt(max, 0);
    return { mode: 'illustrative', label: `${t('scale.illustrative')} · ≤ ×${p}`, detail: t('scale.illus.detail', { p }), maxEnlarge: max };
  }
  return { mode: 'true', label: t('scale.true'), detail: t('scale.true.detail'), maxEnlarge: 1 };
}
