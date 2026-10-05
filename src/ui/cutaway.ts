/**
 * Labels for an open cutaway: anchors on the cut face, hairline leaders, and a column of
 * layer cards with depth, state, how we know (seismology / gravity / model) and sources.
 */
import { Vector3, type PerspectiveCamera } from 'three';
import type { BodiesLayer } from '../render/bodies';
import type { Interior } from '../data/interiors';
import { h } from './dom';
import { fmt, t, tk, type Key } from '../i18n/i18n';
import { BODY } from '../data/bodies';

const NS = 'http://www.w3.org/2000/svg';

export class CutawayLabels {
  readonly root = h('div', { class: 'cutaway', 'aria-live': 'polite' });
  private svg = document.createElementNS(NS, 'svg');
  private col = h('div', { class: 'col' });
  private current: string | null = null;
  private cards: HTMLElement[] = [];
  private paths: SVGPathElement[] = [];
  private dots: SVGCircleElement[] = [];
  private tmp = new Vector3();

  onClose: () => void = () => {};

  constructor(private bodies: BodiesLayer) {
    this.root.append(this.svg, this.col);
    this.root.style.opacity = '0';
    document.body.append(this.root);
  }

  private build(key: string, interior: Interior) {
    this.current = key;
    this.col.replaceChildren();
    this.svg.replaceChildren();
    this.cards = [];
    this.paths = [];
    this.dots = [];
    const R = BODY[key].radiusKm;
    this.col.append(h('div', { class: 'title' }, t('cut.title', { name: tk(`body.${key}`) })));
    // outermost layer first, like reading a section from the surface down
    const layers = [...interior.layers].map((l, i) => ({ l, i, inner: i === 0 ? 0 : interior.layers[i - 1].outerKm })).reverse();
    for (const { l, i, inner } of layers) {
      const from = Math.max(0, R - l.outerKm);
      const to = R - inner;
      const meta = h(
        'div',
        { class: 'meta' },
        h('span', {}, t('cut.depth', { from: fmt(from, 0), to: fmt(to, 0) })),
        h('span', {}, t(`cut.phase.${l.phase}` as Key)),
        l.density ? h('span', {}, t('cut.density', { a: fmt(l.density[0], 1), b: fmt(l.density[1], 1) })) : null,
        l.tempC ? h('span', {}, t('cut.temp', { a: fmt(l.tempC[0], 0), b: fmt(l.tempC[1], 0) })) : null,
      );
      const basis = h('span', { class: `chip ${l.basis === 'model' ? 'illustrative' : 'data'}` }, t(`cut.basis.${l.basis}` as Key));
      meta.prepend(basis);
      const card = h('div', { class: 'layer', style: `--sw:${l.color}` }, h('div', { class: 'nm' }, tk(`layer.${l.key}`)), meta, h('div', { class: 'meta extra' }, h('span', {}, l.refs.join(' · '))));
      card.addEventListener('pointerenter', () => this.hover(key, i));
      card.addEventListener('pointerleave', () => this.hover(key, -1));
      this.col.append(card);
      this.cards[i] = card;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'lead');
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('class', 'anchor');
      dot.setAttribute('r', '3');
      this.svg.append(path, dot);
      this.paths[i] = path;
      this.dots[i] = dot;
    }
    if (interior.caveat) this.col.append(h('div', { class: 'note' }, tk(interior.caveat)));
    this.col.append(h('div', { class: 'note' }, t('cut.legend')));
    this.col.append(h('button', { class: 'hair-btn accent', type: 'button', onclick: () => this.onClose() }, t('card.interior.close')));
  }

  private hover(key: string, i: number) {
    const v = this.bodies.view(key);
    if (v?.cutMat) v.cutMat.uniforms.uHover.value = i;
  }

  relabel() {
    this.current = null;
  }

  update(camera: PerspectiveCamera, width: number, height: number, avoidRight = 0) {
    const c = this.bodies.cutaway;
    if (!c || c.open < 0.15) {
      this.root.style.opacity = '0';
      this.root.style.pointerEvents = 'none';
      if (!c) this.current = null;
      return;
    }
    if (this.current !== c.key) this.build(c.key, c.interior);
    const st = this.bodies.states.get(c.key);
    if (!st) return;
    this.root.style.opacity = String(Math.min(1, (c.open - 0.15) / 0.5));
    this.root.style.pointerEvents = '';

    // column placement: beside the planet, whichever side has room
    const colW = width < 760 ? 200 : 250;
    const narrow = width < 760;
    const right = st.sx + st.px + 56;
    const left = st.sx - st.px - 56 - colW;
    const minX = narrow ? 12 : 190;
    const maxRight = width - 24 - avoidRight;
    const x = right + colW <= maxRight ? right : left >= minX ? left : Math.min(Math.max(minX, width - colW - 24), right);
    const colH = this.col.offsetHeight;
    const y = narrow ? 128 : Math.min(Math.max(96, st.sy - colH / 2), height - colH - 130);
    this.col.style.left = `${x}px`;
    this.col.style.top = `${Math.max(96, y)}px`;
    const onRight = x > st.sx;

    // anchors along the open face, at each layer's mid-radius, slightly above the equator
    const layers = c.interior.layers;
    const R = BODY[c.key].radiusKm;
    // anchors sit on the face nearer to the label column
    this.tmp.copy(c.center).addScaledVector(c.faceA, c.radius * 0.6).project(camera);
    const aOnRight = this.tmp.x * 0.5 + 0.5 > st.sx / width;
    const face = aOnRight === onRight ? c.faceA : c.faceB;
    layers.forEach((l, i) => {
      const inner = i === 0 ? 0 : layers[i - 1].outerKm;
      const mid = ((inner + l.outerKm) / 2 / R) * c.radius;
      const height3d = c.radius * (0.08 + 0.06 * (layers.length - i));
      this.tmp.copy(c.center).addScaledVector(face, mid).addScaledVector(c.axis, height3d).project(camera);
      const ax = (this.tmp.x * 0.5 + 0.5) * width;
      const ay = (-this.tmp.y * 0.5 + 0.5) * height;
      const card = this.cards[i];
      if (!card) return;
      const cy = card.offsetTop + card.offsetHeight / 2 + parseFloat(this.col.style.top);
      const cx = onRight ? x - 8 : x + colW + 8;
      const elbow = onRight ? cx - 26 : cx + 26;
      this.paths[i].setAttribute('d', `M${ax.toFixed(1)},${ay.toFixed(1)} L${elbow.toFixed(1)},${cy.toFixed(1)} L${cx.toFixed(1)},${cy.toFixed(1)}`);
      this.dots[i].setAttribute('cx', ax.toFixed(1));
      this.dots[i].setAttribute('cy', ay.toFixed(1));
    });
  }
}
