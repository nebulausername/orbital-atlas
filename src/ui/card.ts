/** The plate card for the selected body: description, live values, fact sheet, sources. */
import { BODY, type BodyDef } from '../data/bodies';
import { INTERIORS } from '../data/interiors';
import { SOURCE } from '../data/sources';
import type { Simulation } from '../physics/simulation';
import type { AppState, Store } from '../core/store';
import { h, ICON, GLYPH } from './dom';
import { distance, lightTime } from './format';
import { fmt, fmtSci, fmtSig, t, tk, type Key } from '../i18n/i18n';
import { plateNumber } from './plates';

const TEXTURE_SOURCE: Record<string, string> = {
  earth: 'tex-earth',
  moon: 'tex-moon',
  mars: 'tex-mars',
  mercury: 'tex-mercury',
  jupiter: 'tex-jupiter',
  saturn: 'tex-opal',
  uranus: 'tex-opal',
  neptune: 'tex-opal',
  pluto: 'tex-pluto',
  charon: 'tex-pluto',
};

export interface CardActions {
  close(): void;
  fly(key: string): void;
  cut(key: string): void;
  altLayer(): void;
}

export class PlateCard {
  readonly el = h('aside', { class: 'card hidden', 'aria-live': 'polite' });
  private key: string | null = null;
  private live: { dSun?: HTMLElement; dEarth?: HTMLElement; speed?: HTMLElement; light?: HTMLElement } = {};
  private cutBtn?: HTMLButtonElement;
  private altBtn?: HTMLButtonElement;

  constructor(private store: Store<AppState>, private sim: Simulation, private act: CardActions) {}

  show(key: string | null) {
    if (key === this.key && key) return;
    this.key = key;
    if (!key) {
      this.el.classList.add('hidden');
      return;
    }
    this.render(BODY[key]);
    this.el.classList.remove('hidden');
    this.el.scrollTop = 0;
  }

  rerender() {
    if (this.key) this.render(BODY[this.key]);
  }

  private render(def: BodyDef) {
    const f = def.facts;
    const kind = def.kind === 'moon' ? t('kind.moon', { parent: tk(`body.${def.parent}`) }) : t(`kind.${def.kind}` as Key);
    const prov = def.provenance;
    const chips = h('div', { class: 'chips' }, h('span', { class: `chip ${prov === 'data' ? 'data' : prov === 'mixed' ? 'mixed' : 'illustrative'}` }, t(`prov.${prov}` as Key)));
    if (def.facts?.discovered) chips.append(h('span', { class: 'chip', style: 'color:var(--paper-3)' }, `${t('card.discovered')} ${def.facts.discovered.year}`));

    const actions = h('div', { class: 'actions' });
    actions.append(h('button', { class: 'hair-btn', type: 'button', onclick: () => this.act.fly(def.key), html: `${ICON.fly}<span>${t('card.flyto')}</span>` }));
    if (INTERIORS[def.key]) {
      this.cutBtn = h('button', { class: 'hair-btn accent', type: 'button', onclick: () => this.act.cut(def.key) });
      actions.append(this.cutBtn);
    } else {
      this.cutBtn = undefined;
      if (def.kind !== 'spacecraft') actions.append(h('button', { class: 'hair-btn', type: 'button', disabled: true, html: `${ICON.cut}<span>${t('card.interior.none')}</span>` }));
    }
    if (def.altTexture) {
      this.altBtn = h('button', { class: 'hair-btn', type: 'button', onclick: () => this.act.altLayer() });
      actions.append(this.altBtn);
    } else this.altBtn = undefined;

    // live values
    this.live = {};
    const liveDl = h('dl', {});
    const addLive = (label: Key, k: keyof typeof this.live) => {
      const dd = h('dd', {});
      liveDl.append(h('dt', {}, t(label)), dd);
      this.live[k] = dd;
    };
    if (def.kind !== 'star') {
      addLive('card.distanceSun', 'dSun');
      if (def.key !== 'earth') addLive('card.distanceEarth', 'dEarth');
      if (def.kind !== 'moon') addLive('card.speed', 'speed');
      addLive('card.light', 'light');
    }

    // fact sheet
    const dl = h('dl', {});
    const row = (label: Key, value: string | undefined) => value && dl.append(h('dt', {}, t(label)), h('dd', {}, value));
    if (def.radiusKm > 0.01) row('card.radius', `${fmt(def.radiusKm, def.radiusKm < 100 ? 1 : 0)} km`);
    if (f) {
      row('card.mass', `${fmtSci(f.massKg, 4)} kg`);
      if (f.densityKgM3) row('card.density', `${fmt(f.densityKgM3 / 1000, 2)} g/cm³`);
      if (f.gravityMs2) row('card.gravity', `${fmt(f.gravityMs2, 2)} m/s²`);
      if (f.escapeKms) row('card.escape', `${fmt(f.escapeKms, 1)} km/s`);
      if (f.rotationH) row('card.rotation', `${fmtSig(Math.abs(f.rotationH), 4)} h${f.rotationH < 0 ? ` · ${t('card.retrograde')}` : ''}`);
      if (f.dayH) row('card.day', Math.abs(f.dayH) > 72 ? `${fmt(Math.abs(f.dayH) / 24, 1)} d` : `${fmt(f.dayH, 2)} h`);
      if (f.obliquityDeg !== undefined) row('card.tilt', `${fmt(f.obliquityDeg, 2)}°`);
      if (f.periodD) row('card.period', f.periodD > 800 ? `${fmt(f.periodD / 365.25, 2)} a` : `${fmt(f.periodD, f.periodD < 10 ? 3 : 1)} d${def.key === 'triton' ? ` · ${t('card.retrograde')}` : ''}`);
      if (f.aAu) row('card.a', `${fmt(f.aAu, 3)} AU`);
      if (f.aKm) row('card.a', `${fmt(f.aKm, 0)} km`);
      if (f.ecc !== undefined) row('card.ecc', fmt(f.ecc, 4));
      if (f.inclDeg !== undefined) row('card.incl', `${fmt(f.inclDeg, 2)}°`);
      if (f.meanTempC !== undefined) row('card.temp', `${fmt(f.meanTempC, 0)} °C`);
      if (f.pressureBar !== undefined) row('card.pressure', f.pressureBar === 0 ? '—' : `${fmtSig(f.pressureBar, 3)} bar`);
      if (f.discovered) row('card.discovered', `${f.discovered.year} · ${f.discovered.by}`);
    }

    const tex = TEXTURE_SOURCE[def.key] ? SOURCE[TEXTURE_SOURCE[def.key]] : def.texture ? SOURCE['tex-nasa3d'] : undefined;
    const src = h('div', { class: 'src' });
    if (tex) src.append(h('div', {}, `${t('card.texture')}: `, tex.url ? h('a', { href: tex.url, target: '_blank', rel: 'noopener' }, tex.cite.split(' — ')[0]) : tex.cite));
    src.append(h('div', {}, `${t('card.source')}: NASA/JPL Horizons · NASA Planetary Fact Sheets · IAU WGCCRE 2015`));

    const parts: (Node | null)[] = [
      h(
        'div',
        { class: 'head' },
        h('div', { class: 'no caps' }, `${t('plate')} ${plateNumber(`body:${def.key}`)}`),
        h('h2', {}, tk(`body.${def.key}`), GLYPH[def.key] ? h('span', { class: 'glyph', 'aria-hidden': 'true' }, GLYPH[def.key]) : null),
        h('div', { class: 'kind' }, kind),
        chips,
        h('button', { class: 'hair-btn icon x', type: 'button', 'aria-label': t('card.close'), onclick: () => this.act.close(), html: ICON.close }),
      ),
      h('div', { class: 'blurb' }, tk(`blurb.${def.key}`)),
      actions,
      liveDl.childElementCount ? h('section', {}, h('h4', { class: 'caps' }, h('i', { class: 'live-dot' }), t('card.live')), liveDl) : null,
      dl.childElementCount ? h('section', {}, h('h4', { class: 'caps' }, t('card.facts')), dl) : null,
      src,
    ];
    this.el.replaceChildren(...parts.filter((p): p is Node => p !== null));
    this.updateButtons();
  }

  updateButtons() {
    const s = this.store.get();
    if (this.cutBtn && this.key) {
      const open = s.cutaway === this.key;
      this.cutBtn.innerHTML = `${ICON.cut}<span>${open ? t('card.interior.close') : t('card.interior')}</span>`;
      this.cutBtn.setAttribute('aria-pressed', String(open));
    }
    if (this.altBtn && this.key) {
      const def = BODY[this.key];
      this.altBtn.innerHTML = `${ICON.layers}<span>${s.altLayer ? t('layer.visible') : tk(def.altTexture!.labelKey)}</span>`;
      this.altBtn.setAttribute('aria-pressed', String(s.altLayer));
    }
  }

  updateLive() {
    if (!this.key) return;
    const key = this.key;
    const sim = this.sim;
    const p = sim.pos.get(key);
    if (!p) return;
    const sun = sim.pos.get('sun')!;
    const earth = sim.pos.get('earth')!;
    const dSun = Math.hypot(p[0] - sun[0], p[1] - sun[1], p[2] - sun[2]);
    if (this.live.dSun) this.live.dSun.textContent = distance(dSun);
    if (this.live.dEarth) this.live.dEarth.textContent = distance(Math.hypot(p[0] - earth[0], p[1] - earth[1], p[2] - earth[2]));
    if (this.live.speed) this.live.speed.textContent = `${fmt(sim.sunSpeedKms(key), 2)} km/s`;
    if (this.live.light) this.live.light.textContent = lightTime(dSun);
  }
}
