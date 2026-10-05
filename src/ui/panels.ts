import type { Store, AppState } from '../core/store';
import { RATES } from '../core/store';
import { BODY, INDEX_GROUPS } from '../data/bodies';
import { h, ICON, GLYPH } from './dom';
import { distanceShort, dateParts, rateLabel } from './format';
import { fmtSig, getLang, t, tk, type Key } from '../i18n/i18n';
import type { Badge, PlateId } from './plates';
import { plateNumber, plateTitle } from './plates';
import { LOGD_MAX } from '../render/camera';

export interface Actions {
  select(key: string | null, fly?: boolean): void;
  zoomTo(logD: number, key?: string | null): void;
  toggleScale(): void;
  setLang(l: 'de' | 'en'): void;
  toggleSound(): void;
  openPanel(p: AppState['panel']): void;
  seekTo(iso: string): void;
  now(): void;
  setRate(idx: number): void;
  togglePause(): void;
  toggleReverse(): void;
  toggle(k: 'orbits' | 'trails' | 'labels' | 'smallBodies'): void;
  share(): void;
}

/* ------------------------------------------------------------------ top bar */
export class TopBar {
  readonly el: HTMLElement;
  private plateEl: HTMLElement;
  private badgeBtn: HTMLButtonElement;
  private badgeLabel: HTMLElement;
  private badgeDetail: HTMLElement;
  private badgeSwitch: HTMLElement;
  private soundBtn: HTMLButtonElement;
  private plate: PlateId | null = null;
  private badgeMode = '';

  constructor(private store: Store<AppState>, act: Actions) {
    this.plateEl = h('div', { class: 'plate', 'aria-live': 'polite' });
    this.badgeLabel = h('span', {});
    this.badgeDetail = h('div', { class: 'detail' });
    this.badgeSwitch = h('div', { class: 'switch caps' });
    this.badgeBtn = h('button', { class: 'scale-badge', type: 'button', onclick: () => act.toggleScale() }, h('span', { class: 'frame' }, h('i', { class: 'dot' }), this.badgeLabel), this.badgeDetail, this.badgeSwitch);
    this.soundBtn = h('button', { class: 'hair-btn icon', type: 'button', onclick: () => act.toggleSound() });
    const lang = getLang();
    this.el = h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'wordmark' }, h('div', { class: 'name' }, 'ORBITAL ATLAS'), this.plateEl),
      this.badgeBtn,
      h(
        'nav',
        { class: 'tools', 'aria-label': t('misc.menu') },
        h('button', { class: 'hair-btn desk', type: 'button', onclick: () => act.setLang(lang === 'de' ? 'en' : 'de'), title: t('toggle.lang'), lang: lang === 'de' ? 'en' : 'de' }, t('toggle.lang.short')),
        this.soundBtn,
        h('button', { class: 'hair-btn icon desk', type: 'button', title: t('misc.share'), 'aria-label': t('misc.share'), onclick: () => act.share(), html: ICON.share }),
        h('button', { class: 'hair-btn icon', type: 'button', title: t('legend.title'), 'aria-label': t('legend.title'), onclick: () => act.openPanel('legend'), html: ICON.legend }),
        h('button', { class: 'hair-btn icon', type: 'button', title: t('colophon.title'), 'aria-label': t('colophon.title'), onclick: () => act.openPanel('colophon'), html: ICON.sources }),
        h('button', { class: 'hair-btn icon desk', type: 'button', title: t('help.title'), 'aria-label': t('help.title'), onclick: () => act.openPanel('help'), html: ICON.help }),
        h('button', { class: 'hair-btn mobile-only', type: 'button', onclick: () => act.setLang(lang === 'de' ? 'en' : 'de'), lang: lang === 'de' ? 'en' : 'de' }, t('toggle.lang.short')),
      ),
    );
    this.renderSound();
  }

  renderSound() {
    const on = this.store.get().sound;
    this.soundBtn.innerHTML = on ? ICON.sound : ICON.mute;
    this.soundBtn.setAttribute('aria-pressed', String(on));
    this.soundBtn.title = t('toggle.sound');
    this.soundBtn.setAttribute('aria-label', t('toggle.sound'));
  }

  update(plate: PlateId, badge: Badge) {
    if (plate !== this.plate) {
      this.plate = plate;
      this.plateEl.replaceChildren(h('em', {}, `${t('plate')} ${plateNumber(plate)}`), plateTitle(plate));
      this.plateEl.animate?.([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22,.61,.2,1)' });
    }
    const key = `${badge.mode}|${badge.label}`;
    if (key !== this.badgeMode) {
      const modeChanged = !this.badgeMode.startsWith(badge.mode);
      this.badgeMode = key;
      this.badgeBtn.className = `scale-badge ${badge.mode}`;
      this.badgeLabel.textContent = badge.label;
      this.badgeDetail.textContent = badge.detail;
      const illus = this.store.get().scaleMode === 'illustrative';
      this.badgeSwitch.textContent = badge.mode === 'model' ? '' : t('scale.toggle', { mode: illus ? t('scale.true') : t('scale.illustrative') });
      this.badgeBtn.setAttribute('aria-label', `${badge.label}. ${badge.detail}`);
      if (modeChanged) {
        this.badgeBtn.classList.add('flash');
        setTimeout(() => this.badgeBtn.classList.remove('flash'), 2600);
      }
    }
  }
}

/* --------------------------------------------------------------- altimeter */
const LOGD_MIN = -5;
export const STOPS: { key: Key; logD: number; focus: 'sun' | 'system' | 'surface' }[] = [
  { key: 'alt.galaxy', logD: 10.15, focus: 'sun' },
  { key: 'alt.stars', logD: 6.35, focus: 'sun' },
  { key: 'alt.oort', logD: 4.65, focus: 'sun' },
  { key: 'alt.helio', logD: 2.5, focus: 'sun' },
  { key: 'alt.outer', logD: 1.78, focus: 'sun' },
  { key: 'alt.inner', logD: 0.55, focus: 'sun' },
  { key: 'alt.system', logD: -1.9, focus: 'system' },
  { key: 'alt.surface', logD: -3.9, focus: 'surface' },
];

export class Altimeter {
  readonly el: HTMLElement;
  private marker: HTMLElement;
  private markerText: HTMLElement;
  private stops: HTMLElement[] = [];
  private last = '';

  constructor(act: Actions, private systemTarget: () => { key: string; logD: number; surface: number }) {
    const rail = h('div', { class: 'rail' });
    this.markerText = h('span', {});
    this.marker = h('div', { class: 'marker' }, this.markerText);
    this.el = h('div', { class: 'altimeter', role: 'group', 'aria-label': t('alt.title') }, h('div', { class: 'title caps' }, t('alt.title')), rail);
    for (let d = Math.ceil(LOGD_MIN); d <= Math.floor(LOGD_MAX); d++) {
      const tick = h('i', { class: `tick${d % 5 === 0 ? ' major' : ''}` });
      tick.style.top = `${this.pct(d)}%`;
      this.el.append(tick);
    }
    for (const s of STOPS) {
      const b = h('button', { class: 'stop', type: 'button', 'aria-label': t(s.key) }, h('span', {}, t(s.key)));
      b.style.top = `${this.pct(s.logD)}%`;
      b.addEventListener('click', () => {
        if (s.focus === 'sun') act.zoomTo(s.logD, 'sun');
        else {
          const sys = this.systemTarget();
          act.zoomTo(s.focus === 'system' ? sys.logD : sys.surface, sys.key);
        }
      });
      this.stops.push(b);
      this.el.append(b);
    }
    this.el.append(this.marker);
  }

  private pct(logD: number) {
    return ((LOGD_MAX - logD) / (LOGD_MAX - LOGD_MIN)) * 100;
  }

  update(logD: number) {
    this.marker.style.top = `${this.pct(Math.max(LOGD_MIN, logD))}%`;
    const txt = distanceShort(10 ** logD);
    if (txt !== this.last) {
      this.last = txt;
      this.markerText.textContent = txt;
    }
    STOPS.forEach((s, i) => {
      const d = Math.abs(s.logD - logD);
      this.stops[i].classList.toggle('near', d < 0.6);
      // the marker carries the value; a stop label right under it steps aside
      this.stops[i].style.opacity = d < 0.42 ? '0' : '';
    });
  }
}

/* ------------------------------------------------------------ time console */
export class TimeConsole {
  readonly el: HTMLElement;
  private d = h('div', { class: 'd' });
  private tm = h('div', { class: 't' });
  private rateVal = h('div', { class: 'val' });
  private bar = h('div', { class: 'bar' });
  private play: HTMLButtonElement;
  private rev: HTMLButtonElement;
  private warn = h('div', { class: 'warn', role: 'status' });
  private dateInput: HTMLInputElement;
  private lastKey = '';

  constructor(private store: Store<AppState>, act: Actions) {
    this.play = h('button', { class: 'hair-btn play', type: 'button', onclick: () => act.togglePause() });
    this.rev = h('button', { class: 'hair-btn', type: 'button', onclick: () => act.toggleReverse(), html: ICON.reverse, title: t('time.reverse'), 'aria-label': t('time.reverse') });
    this.dateInput = h('input', { type: 'date', min: '1800-01-01', max: '2199-12-31', 'aria-label': t('time.date') });
    this.dateInput.addEventListener('change', () => this.dateInput.value && act.seekTo(this.dateInput.value));
    const cal = h('button', { class: 'hair-btn icon', type: 'button', title: `${t('time.date')} — ${t('time.range')}`, 'aria-label': t('time.date'), html: ICON.calendar });
    cal.addEventListener('click', () => {
      this.dateInput.value = dateParts(0).iso;
      try {
        this.dateInput.showPicker();
      } catch {
        const v = prompt(`${t('time.date')} (YYYY-MM-DD)\n${t('time.range')}`);
        if (v) act.seekTo(v);
      }
    });
    for (let i = 0; i < RATES.length; i++) this.bar.append(h('i', {}));
    this.el = h(
      'section',
      { class: 'time-console', 'aria-label': t('time.title') },
      this.warn,
      h('div', { class: 'date' }, this.d, this.tm),
      h(
        'div',
        { class: 'transport' },
        this.rev,
        h('button', { class: 'hair-btn slow-fast', type: 'button', onclick: () => act.setRate(this.store.get().rateIdx - 1), html: ICON.slower, title: t('time.slower'), 'aria-label': t('time.slower') }),
        this.play,
        h('button', { class: 'hair-btn slow-fast', type: 'button', onclick: () => act.setRate(this.store.get().rateIdx + 1), html: ICON.faster, title: t('time.faster'), 'aria-label': t('time.faster') }),
      ),
      h(
        'div',
        { class: 'rate' },
        this.rateVal,
        this.bar,
        h(
          'div',
          { class: 'extra' },
          h('button', { class: 'hair-btn', type: 'button', onclick: () => act.now(), title: t('time.now') }, t('time.now')),
          cal,
          this.dateInput,
        ),
      ),
    );
  }

  update(jd: number, throttled: boolean) {
    const s = this.store.get();
    const p = dateParts(jd);
    this.d.textContent = p.date;
    this.tm.textContent = `${p.weekday} · ${p.time} ${t('time.utc')}`;
    const key = `${s.paused}|${s.rateIdx}|${s.direction}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.play.innerHTML = s.paused ? ICON.play : ICON.pause;
      this.play.title = s.paused ? t('time.play') : t('time.pause');
      this.play.setAttribute('aria-label', this.play.title);
      this.rev.setAttribute('aria-pressed', String(s.direction < 0));
      this.rateVal.textContent = rateLabel(s.rateIdx, s.direction);
      [...this.bar.children].forEach((c, i) => c.classList.toggle('on', i <= s.rateIdx));
      this.bar.classList.toggle('rev', s.direction < 0);
    }
    this.warn.textContent = throttled && !s.paused ? t('time.throttled') : '';
  }
}

/* -------------------------------------------------------- readout & toggles */
export class Readout {
  readonly el = h('div', { class: 'readout', 'aria-hidden': 'true' });
  private a = h('div', {});
  private b = h('div', {});
  private c = h('div', {});
  constructor() {
    this.el.append(this.a, this.b, this.c);
  }
  update(logD: number, focus: string | null, drift: number) {
    this.a.innerHTML = `${t('alt.distance').toUpperCase()} <b>${distanceShort(10 ** logD)}</b>${focus ? ` · ${GLYPH[focus] ?? ''} ${tk(`body.${focus}`)}` : ''}`;
    this.b.innerHTML = `${t('misc.energy').toUpperCase()} <b>${drift === 0 ? '0' : `${fmtSig(Math.abs(drift) / 10 ** Math.floor(Math.log10(Math.abs(drift))), 2)}e${Math.floor(Math.log10(Math.abs(drift)))}`}</b>`;
    this.c.innerHTML = `YOSHIDA-4 · Δt 1.5 h · 1PN ☉`;
  }
}

export class LayerToggles {
  readonly el = h('div', { class: 'layer-toggles', role: 'group', 'aria-label': t('toggle.layers') });
  private btns: Record<string, HTMLButtonElement> = {};
  constructor(private store: Store<AppState>, act: Actions) {
    const defs: ['orbits' | 'trails' | 'labels' | 'smallBodies', string, Key, string][] = [
      ['orbits', ICON.orbits, 'toggle.orbits', 'O'],
      ['trails', ICON.trails, 'toggle.trails', 'T'],
      ['labels', ICON.labels, 'toggle.labels', 'L'],
      ['smallBodies', ICON.asteroids, 'toggle.smallbodies', 'A'],
    ];
    for (const [k, icon, label, key] of defs) {
      const b = h('button', { class: 'hair-btn icon', type: 'button', html: icon, title: `${t(label)} (${key})`, 'aria-label': t(label), onclick: () => act.toggle(k) });
      this.btns[k] = b;
      this.el.append(b);
    }
    this.update();
  }
  update() {
    const s = this.store.get();
    for (const k of Object.keys(this.btns)) this.btns[k].setAttribute('aria-pressed', String(s[k as 'orbits']));
  }
}

/* ------------------------------------------------------------------- index */
export class BodyIndex {
  readonly el: HTMLElement;
  private items = new Map<string, { b: HTMLButtonElement; n: HTMLElement }>();
  constructor(private store: Store<AppState>, act: Actions) {
    this.el = h('nav', { class: 'index', 'aria-label': t('index.title') });
    for (const g of INDEX_GROUPS) {
      const list = h('div', { class: 'grp' });
      const collapsible = g.key === 'group.moons';
      if (collapsible) {
        const btn = h('button', { type: 'button', class: 'grp-toggle caps', 'aria-expanded': 'false' }, `${t(g.key as Key)} · ${g.members.length}`);
        btn.addEventListener('click', () => {
          const open = btn.getAttribute('aria-expanded') !== 'true';
          btn.setAttribute('aria-expanded', String(open));
          list.hidden = !open;
        });
        list.hidden = true;
        this.el.append(btn);
      } else this.el.append(h('h3', { class: 'caps' }, t(g.key as Key)));
      for (const key of g.members) {
        const n = h('span', { class: 'n' });
        const b = h('button', { type: 'button', class: BODY[key].kind === 'moon' ? 'moon' : '' }, h('span', { class: 'g' }, GLYPH[key] ?? (BODY[key].kind === 'spacecraft' ? '◇' : '○')), h('span', {}, tk(`body.${key}`)), n);
        b.addEventListener('click', () => act.select(key, true));
        this.items.set(key, { b, n });
        list.append(b);
      }
      this.el.append(list);
    }
  }
  update(dist: (key: string) => number | undefined) {
    const sel = this.store.get().selected;
    for (const [key, { b, n }] of this.items) {
      b.setAttribute('aria-current', String(key === sel));
      const def = BODY[key];
      if (def.kind === 'planet' || def.kind === 'dwarf' || def.kind === 'comet' || def.kind === 'spacecraft') {
        const d = dist(key);
        n.textContent = d === undefined ? '' : distanceShort(d);
      }
    }
  }
}

/* ------------------------------------------------------------------- toast */
export class Toast {
  readonly el = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
  private text = h('div', {});
  private bar = h('div', { class: 'bar' }, h('i', {}));
  private timer = 0;
  constructor() {
    this.el.append(this.text, this.bar);
  }
  show(msg: string, ms = 3000, progress?: number) {
    this.text.textContent = msg;
    this.bar.style.display = progress === undefined ? 'none' : '';
    if (progress !== undefined) (this.bar.firstChild as HTMLElement).style.width = `${progress * 100}%`;
    this.el.classList.add('show');
    clearTimeout(this.timer);
    if (ms > 0) this.timer = window.setTimeout(() => this.el.classList.remove('show'), ms);
  }
  hide() {
    this.el.classList.remove('show');
  }
}
