/** Side sheets: legend, colophon & sources, controls. */
import { SOURCES } from '../data/sources';
import { h, ICON } from './dom';
import { fmt, getLang, t, tk } from '../i18n/i18n';

export const REPO_URL = 'https://github.com/nebulausername/orbital-atlas';

export class Sheets {
  readonly backdrop = h('div', { class: 'sheet-backdrop' });
  readonly sheet = h('aside', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
  private open: string | null = null;
  private lastFocus: Element | null = null;

  /** extra content for the mobile menu (toggles etc.), provided by the app */
  menuContent: () => Node[] = () => [];

  constructor(private onClose: () => void, private smallCount: () => number) {
    this.backdrop.addEventListener('click', () => onClose());
    this.sheet.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = [...this.sheet.querySelectorAll<HTMLElement>('a, button')];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    });
  }

  show(which: 'legend' | 'colophon' | 'help' | 'menu' | null) {
    if (which === this.open) return;
    this.open = which;
    if (!which) {
      this.sheet.classList.remove('open');
      this.backdrop.classList.remove('open');
      (this.lastFocus as HTMLElement | null)?.focus?.();
      return;
    }
    this.lastFocus = document.activeElement;
    const close = h('button', { class: 'hair-btn icon x', type: 'button', 'aria-label': t('card.close'), onclick: () => this.onClose(), html: ICON.close });
    const body = which === 'legend' ? this.legend() : which === 'colophon' ? this.colophon() : which === 'menu' ? [h('div', { class: 'caps', style: 'color:var(--vermilion)' }, t('app.title')), h('h2', {}, t('misc.menu')), ...this.menuContent()] : this.help();
    this.sheet.replaceChildren(close, ...body);
    this.sheet.setAttribute('aria-label', which === 'legend' ? t('legend.title') : which === 'colophon' ? t('colophon.title') : which === 'menu' ? t('misc.menu') : t('help.title'));
    this.sheet.classList.add('open');
    this.backdrop.classList.add('open');
    this.sheet.scrollTop = 0;
    requestAnimationFrame(() => close.focus());
  }

  rerender() {
    const w = this.open as 'legend' | 'colophon' | 'help' | 'menu' | null;
    this.open = null;
    if (w) this.show(w);
  }

  private legend(): Node[] {
    const sw = (html: string) => h('div', { class: 'sw', html });
    const row = (s: Node, text: string) => h('div', { class: 'legend-row' }, s, h('div', {}, text));
    return [
      h('div', { class: 'caps', style: 'color:var(--vermilion)' }, `${t('plate')} 0`),
      h('h2', {}, t('legend.title')),
      row(h('span', { class: 'chip data' }, t('scale.true')), t('legend.true')),
      row(h('span', { class: 'chip illustrative' }, t('scale.illustrative')), t('legend.illus')),
      row(sw('<svg width="40" height="20"><circle cx="20" cy="10" r="5" fill="none" stroke="#ece4d4" stroke-opacity=".75"/></svg>'), t('legend.marker')),
      row(sw('<svg width="60" height="20"><path d="M2 14 C 20 2, 40 2, 58 14" fill="none" stroke="#ece4d4" stroke-opacity=".5"/></svg>'), t('legend.orbit')),
      row(sw('<svg width="60" height="20"><defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#7fb6d9" stop-opacity="0"/><stop offset="1" stop-color="#7fb6d9"/></linearGradient></defs><path d="M2 16 C 20 4, 40 4, 56 10" fill="none" stroke="url(#lg)" stroke-width="2"/><circle cx="56" cy="10" r="3" fill="#7fb6d9"/></svg>'), t('legend.trail')),
      row(sw('<svg width="40" height="30"><defs><pattern id="ht" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><path d="M0 0v5" stroke="#9e958a" stroke-width="1"/></pattern></defs><circle cx="20" cy="15" r="13" fill="#11151f"/><circle cx="20" cy="15" r="13" fill="url(#ht)"/></svg>'), t('legend.incognita')),
      row(sw('<svg width="60" height="20"><g fill="#cbbfa8"><circle cx="8" cy="10" r="1.3"/><circle cx="18" cy="6" r="1.3"/><circle cx="27" cy="13" r="1.3"/></g><circle cx="38" cy="8" r="1.5" fill="#ff6a3d"/><circle cx="46" cy="13" r="1.4" fill="#6fc3ad"/><circle cx="54" cy="7" r="1.4" fill="#8fa4ff"/></svg>'), t('legend.smallbodies', { n: fmt(this.smallCount(), 0) })),
      h(
        'div',
        { class: 'legend-row' },
        h('div', { class: 'sw' }),
        h('div', { class: 'mono', style: 'font-size:11px;color:var(--paper-3)' }, `● ${t('sb.MBA')}   `, h('span', { style: 'color:#ff6a3d' }, `● ${t('sb.NEO')}   `), h('span', { style: 'color:#6fc3ad' }, `● ${t('sb.TJN')}   `), h('span', { style: 'color:#e7b45a' }, `● ${t('sb.CEN')}   `), h('span', { style: 'color:#8fa4ff' }, `● ${t('sb.TNO')}`)),
      ),
    ];
  }

  private colophon(): Node[] {
    const de = getLang() === 'de';
    const legal = de ? 'https://kaufmeinewebsite.de/legal' : 'https://kaufmeinewebsite.de/en/legal';
    return [
      h('div', { class: 'caps', style: 'color:var(--vermilion)' }, t('app.title')),
      h('h2', {}, t('colophon.title')),
      h('p', { class: 'serif', style: 'font-size:20px;color:var(--paper)' }, t('app.tagline')),
      h('h3', { class: 'caps' }, t('colophon.how')),
      h('p', {}, t('colophon.how.body', { n: fmt(this.smallCount(), 0) })),
      h('h3', { class: 'caps' }, t('colophon.accuracy')),
      h('p', {}, t('colophon.accuracy.body')),
      h('h3', { class: 'caps' }, t('colophon.scale')),
      h('p', {}, t('colophon.scale.body')),
      h('h3', { class: 'caps' }, t('colophon.images')),
      h('p', {}, t('colophon.images.body')),
      h('h3', { class: 'caps' }, t('colophon.sources')),
      h(
        'ol',
        { class: 'sources' },
        ...SOURCES.map((s) =>
          h(
            'li',
            {},
            s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.cite) : s.cite,
            h('span', { class: 'use' }, tk(s.use)),
            s.note ? h('span', { class: 'note' }, s.note) : null,
          ),
        ),
      ),
      h(
        'div',
        { class: 'footer' },
        h('span', {}, t('colophon.made')),
        h('span', {}, t('colophon.privacy')),
        h('a', { href: `${legal}#impressum`, target: '_blank', rel: 'noopener' }, t('colophon.imprint')),
        h('a', { href: `${legal}#datenschutz`, target: '_blank', rel: 'noopener' }, t('colophon.privacyLink')),
        h('a', { href: REPO_URL, target: '_blank', rel: 'noopener' }, t('colophon.code')),
      ),
    ];
  }

  private help(): Node[] {
    const keys = ['help.drag', 'help.zoom', 'help.click', 'help.keys.space', 'help.keys.arrows', 'help.keys.r', 'help.keys.n', 'help.keys.s', 'help.keys.i', 'help.keys.o', 'help.keys.digits', 'help.keys.esc'] as const;
    return [h('div', { class: 'caps', style: 'color:var(--vermilion)' }, t('app.title')), h('h2', {}, t('help.title')), h('div', { class: 'kbd' }, ...keys.map((k) => h('div', {}, t(k))))];
  }
}
