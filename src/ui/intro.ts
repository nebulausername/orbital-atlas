/** Frontispiece: an engraved orrery, the title, a loading ruler, then the dive. */
import { h } from './dom';
import { t } from '../i18n/i18n';

const ORBITS = [0.39, 0.72, 1.0, 1.52, 5.2, 9.58, 19.2, 30.1];
const PERIODS = [0.24, 0.62, 1, 1.88, 11.86, 29.46, 84.0, 164.8];

function orrery(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-110 -110 220 220');
  svg.setAttribute('class', 'orrery');
  svg.setAttribute('aria-hidden', 'true');
  const el = (tag: string, attrs: Record<string, string | number>) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  };
  // graticule ticks around the outside, like a printed dial
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const r0 = i % 6 === 0 ? 100 : 103;
    svg.append(el('line', { x1: Math.cos(a) * r0, y1: Math.sin(a) * r0, x2: Math.cos(a) * 106, y2: Math.sin(a) * 106, class: 'tick' }));
  }
  svg.append(el('circle', { cx: 0, cy: 0, r: 106, class: 'ring dash' }));
  ORBITS.forEach((a, i) => {
    const r = 12 + Math.sqrt(a / 30.1) * 84;
    const ring = el('circle', { cx: 0, cy: 0, r, class: 'ring' });
    (ring as SVGElement).style.animationDelay = `${0.15 * i}s`;
    svg.append(ring);
    const g = el('g', {});
    const dur = 6 * Math.sqrt(PERIODS[i]);
    const spin = el('animateTransform', { attributeName: 'transform', type: 'rotate', from: '0 0 0', to: '-360 0 0', dur: `${dur}s`, repeatCount: 'indefinite' });
    g.append(spin);
    const phase = (i * 137.5 * Math.PI) / 180;
    g.append(el('circle', { cx: Math.cos(phase) * r, cy: Math.sin(phase) * r, r: i >= 4 ? 2.6 : 1.8, class: 'planet' }));
    svg.append(g);
  });
  svg.append(el('circle', { cx: 0, cy: 0, r: 4.2, class: 'sun' }));
  return svg;
}

export class Intro {
  readonly el: HTMLElement;
  private bar: HTMLElement;
  private status: HTMLElement;
  private enter: HTMLButtonElement;
  readonly flight = h('div', { class: 'flight-title', 'aria-live': 'polite' });
  private flightKey = '';
  private flightTimer = 0;

  constructor(onEnter: () => void, onSkip: () => void) {
    const title = h('h1', {});
    [...t('app.title')].forEach((c, i) => {
      const s = h('span', {}, c === ' ' ? ' ' : c);
      s.style.animationDelay = `${0.35 + i * 0.055}s`;
      title.append(s);
    });
    this.bar = h('i', {});
    this.status = h('div', { class: 'caps' }, t('intro.loading'));
    this.enter = h('button', { class: 'hair-btn accent enter', type: 'button', onclick: () => onEnter() }, t('intro.enter'));
    this.el = h(
      'div',
      { class: 'intro', role: 'dialog', 'aria-label': t('app.title') },
      h(
        'div',
        { class: 'inner' },
        orrery(),
        h('div', { class: 'caps kicker' }, t('intro.kicker')),
        title,
        h('p', { class: 'lede' }, t('intro.line1'), h('br', {}), t('intro.line2')),
        h('div', { class: 'progress' }, h('div', { class: 'scale' }, this.bar), this.status),
        this.enter,
      ),
      h('button', { class: 'hair-btn skip', type: 'button', onclick: () => onSkip() }, t('intro.skip')),
    );
    document.body.append(this.el, this.flight);
  }

  progress(f: number) {
    this.bar.style.width = `${Math.round(f * 100)}%`;
    this.status.textContent = `${t('intro.loading')} · ${Math.round(f * 100)} %`;
  }

  ready() {
    this.progress(1);
    this.enter.classList.add('ready');
    this.enter.focus({ preventScroll: true });
  }

  flying() {
    this.el.classList.add('flying');
  }

  done() {
    this.el.classList.add('gone');
    this.showFlight(null);
    setTimeout(() => this.el.remove(), 1400);
  }

  /** Big plate titles during the opening dive. */
  showFlight(p: { no: string; title: string; sub: string } | null) {
    const key = p ? p.title : '';
    if (key === this.flightKey) return;
    this.flightKey = key;
    clearTimeout(this.flightTimer);
    if (!p) {
      this.flight.classList.remove('show');
      return;
    }
    this.flight.classList.remove('show');
    this.flightTimer = window.setTimeout(() => {
      this.flight.replaceChildren(h('div', { class: 'no caps' }, p.no), h('div', { class: 't' }, p.title), h('div', { class: 's' }, p.sub));
      this.flight.classList.add('show');
    }, 220);
  }
}
