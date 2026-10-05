/**
 * Body labels and plate annotations, placed in screen space every frame with a simple
 * greedy declutter: higher priority first, anything overlapping a placed label is hidden.
 */
import { Vector3, type PerspectiveCamera } from 'three';
import type { BodiesLayer, BodyState } from '../render/bodies';
import type { Annotation } from '../render/space';
import { h } from './dom';
import { fmt, t, tk, type Key } from '../i18n/i18n';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const KIND_PRIORITY: Record<string, number> = { star: 100, planet: 80, dwarf: 55, comet: 45, moon: 40, spacecraft: 35 };

export class Labels {
  readonly root = h('div', { class: 'labels', 'aria-hidden': 'true' });
  private bodyEls = new Map<string, { el: HTMLElement; nm: HTMLElement; mk: HTMLElement; fx: HTMLElement; w: number }>();
  private annEls = new Map<string, { el: HTMLElement; w: number; text: string }>();
  private tmp = new Vector3();
  onPick: (key: string) => void = () => {};
  hovered: string | null = null;

  constructor(private bodies: BodiesLayer) {
    document.body.append(this.root);
  }

  /** Re-render text after a language switch. */
  relabel() {
    for (const [key, b] of this.bodyEls) {
      b.nm.textContent = tk(`body.${key}`);
      b.w = 0;
    }
    for (const a of this.annEls.values()) a.w = 0, (a.text = '');
  }

  private bodyEl(st: BodyState) {
    let b = this.bodyEls.get(st.key);
    if (!b) {
      const mk = h('span', { class: 'mk' });
      const nm = h('span', { class: 'nm' }, tk(`body.${st.key}`));
      const fx = h('span', { class: 'fx' });
      const el = h('div', { class: `lbl ${st.def.kind}`, 'data-key': st.key }, mk, nm, fx);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onPick(st.key);
      });
      el.addEventListener('pointerenter', () => (this.hovered = st.key));
      el.addEventListener('pointerleave', () => (this.hovered = null));
      this.root.append(el);
      b = { el, nm, mk, fx, w: 0 };
      this.bodyEls.set(st.key, b);
    }
    return b;
  }

  /** screen areas covered by panels; labels stay out of them */
  blocked: Rect[] = [];

  update(opts: { cutaway?: string | null; show: boolean; selected: string | null; focus: string | null; illus: boolean; annotations: Annotation[]; camera: PerspectiveCamera; width: number; height: number; logD: number }) {
    const placed: Rect[] = [];
    const blocked = this.blocked;
    const states = [...this.bodies.states.values()]
      .filter((s) => s.onScreen && !s.merged)
      .sort((a, b) => this.priority(b, opts) - this.priority(a, opts));
    const shown = new Set<string>();
    for (const st of states) {
      if (st.def.kind === 'spacecraft' && Math.log10(st.dist) > 3.4) continue;
      if (!opts.show && st.key !== opts.selected) continue;
      // beyond the heliosphere single bodies are meaningless; the plate annotations take over
      if (opts.logD > 4.4 && st.key !== opts.selected) continue;
      // an open section is a plate of its own
      if (opts.cutaway && st.key !== opts.cutaway) continue;
      // spacecraft and small moons only once they are distinguishable
      const b = this.bodyEl(st);
      const r = Math.max(st.px, 5);
      if (!b.w) b.w = b.el.offsetWidth || 80;
      const x = st.sx + r + 4;
      const rect = { x: st.sx - 6, y: st.sy - 9, w: b.w + r + 10, h: 18 };
      const essential = st.key === opts.selected || st.key === opts.focus;
      if (!essential && (placed.some((p) => overlaps(p, rect)) || blocked.some((p) => overlaps(p, rect)))) continue;
      placed.push(rect);
      shown.add(st.key);
      const tiny = st.px < 4;
      b.mk.classList.toggle('hide', !tiny);
      b.el.style.transform = `translate3d(${(tiny ? st.sx : x - 7).toFixed(1)}px, ${(st.sy - 9).toFixed(1)}px, 0)`;
      b.el.style.opacity = '1';
      b.el.classList.toggle('sel', st.key === opts.selected);
      const showFx = opts.illus && st.enlarge > 1.5 && st.px >= 1.5 && st.def.kind !== 'spacecraft';
      const fx = showFx ? `×${fmt(st.enlarge, 0)}` : '';
      if (b.fx.textContent !== fx) {
        b.fx.textContent = fx;
        b.w = 0;
      }
      b.fx.style.display = showFx ? '' : 'none';
    }
    for (const [key, b] of this.bodyEls) {
      if (!shown.has(key)) b.el.style.opacity = '0';
      b.el.style.pointerEvents = shown.has(key) ? 'auto' : 'none';
    }

    // annotations
    const anns = [...opts.annotations].sort((a, b) => b.priority - a.priority);
    const used = new Set<string>();
    for (const a of anns) {
      if (a.opacity < 0.05) continue;
      this.tmp.copy(a.at).project(opts.camera);
      if (this.tmp.z > 1 || Math.abs(this.tmp.x) > 1.05 || Math.abs(this.tmp.y) > 1.05) continue;
      const sx = (this.tmp.x * 0.5 + 0.5) * opts.width;
      const sy = (-this.tmp.y * 0.5 + 0.5) * opts.height;
      let e = this.annEls.get(a.id);
      if (!e) {
        e = { el: h('div', { class: `ann ${a.kind}` }), w: 0, text: '' };
        this.root.append(e.el);
        this.annEls.set(a.id, e);
      }
      const n = a.sub && /^\d+(\.\d+)?$/.test(a.sub) ? fmt(Number(a.sub), 0) : (a.sub ?? '');
      const text = a.text.includes('.') && !a.text.includes(' ') ? tk(a.text, { n }) : a.text;
      const html = a.kind === 'star' && a.sub ? `${text}<small>${fmt(Number(a.sub), 1)} ${t('misc.ly' as Key)}</small>` : text;
      if (e.text !== html) {
        e.el.innerHTML = html;
        e.text = html;
        e.w = 0;
      }
      if (!e.w) e.w = e.el.offsetWidth || 100;
      const centred = a.kind === 'region' || a.kind === 'arm';
      const x = centred ? sx - e.w / 2 : sx;
      const rect = { x, y: sy - 9, w: e.w, h: 18 };
      if (placed.some((p) => overlaps(p, rect)) || blocked.some((p) => overlaps(p, rect))) continue;
      placed.push(rect);
      used.add(a.id);
      e.el.style.transform = `translate3d(${x.toFixed(1)}px, ${(sy - 9).toFixed(1)}px, 0)`;
      e.el.style.opacity = String(Math.min(1, a.opacity));
    }
    for (const [id, e] of this.annEls) if (!used.has(id)) e.el.style.opacity = '0';
  }

  private priority(st: BodyState, opts: { selected: string | null; focus: string | null }) {
    if (st.key === opts.selected) return 1000;
    if (st.key === opts.focus) return 900;
    return (KIND_PRIORITY[st.def.kind] ?? 10) + Math.min(30, st.px);
  }
}
