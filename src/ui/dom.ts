/** Minimal DOM helpers. */
type Attrs = Record<string, string | number | boolean | undefined | ((e: Event) => void)>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function svg(markup: string): SVGElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as SVGElement;
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

/** Thin-stroke icons drawn for the atlas (24 × 24, stroke = currentColor). */
const I = (d: string) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  play: I('<path d="M8 5.5v13l10.5-6.5z"/>'),
  pause: I('<path d="M8.5 5.5v13M15.5 5.5v13"/>'),
  reverse: I('<path d="M16 5.5v13L5.5 12z"/>'),
  slower: I('<path d="M12 6.5v11l-7-5.5zM19 6.5v11l-7-5.5z"/>'),
  faster: I('<path d="M5 6.5v11l7-5.5zM12 6.5v11l7-5.5z"/>'),
  now: I('<circle cx="12" cy="12" r="7.5"/><path d="M12 7.5V12l3 2"/>'),
  calendar: I('<rect x="4" y="5.5" width="16" height="14" rx="1"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>'),
  sound: I('<path d="M5 9.5h3l4-3.5v12l-4-3.5H5z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>'),
  mute: I('<path d="M5 9.5h3l4-3.5v12l-4-3.5H5z"/><path d="M16 10l4 4M20 10l-4 4"/>'),
  legend: I('<rect x="4.5" y="4.5" width="15" height="15" rx="1"/><path d="M8 9h8M8 12h8M8 15h5"/>'),
  sources: I('<path d="M6 4.5h9l3 3v12H6z"/><path d="M15 4.5v3h3M9 11h6M9 14h6M9 17h4"/>'),
  help: I('<circle cx="12" cy="12" r="8"/><path d="M9.8 9.6a2.3 2.3 0 1 1 3.2 2.1c-.7.3-1 .8-1 1.5v.6"/><path d="M12 16.6v.4"/>'),
  close: I('<path d="M6 6l12 12M18 6L6 18"/>'),
  fly: I('<circle cx="12" cy="12" r="3"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>'),
  cut: I('<circle cx="12" cy="12" r="8"/><path d="M12 12V4M12 12h8"/><path d="M12 4a8 8 0 0 1 8 8" stroke-dasharray="2 2"/>'),
  layers: I('<path d="M12 4l8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4M4 16l8 4 8-4"/>'),
  share: I('<path d="M10 14l4-4M8.5 12.5l-2 2a3 3 0 0 0 4.2 4.2l2-2M15.5 11.5l2-2a3 3 0 0 0-4.2-4.2l-2 2"/>'),
  list: I('<path d="M5 7h14M5 12h14M5 17h14"/>'),
  orbits: I('<ellipse cx="12" cy="12" rx="8.5" ry="4.5"/><circle cx="12" cy="12" r="1.6"/>'),
  trails: I('<path d="M4 17c4-1 6-5 9-7s5-2 7-2"/><circle cx="20" cy="8" r="1.4"/>'),
  labels: I('<path d="M5 6h14M5 6v12M9 10h8M9 14h6"/>'),
  asteroids: I('<circle cx="7" cy="8" r="1"/><circle cx="12" cy="6" r=".8"/><circle cx="17" cy="9" r="1.1"/><circle cx="9" cy="14" r=".9"/><circle cx="15" cy="15" r="1"/><circle cx="12" cy="18.5" r=".8"/>'),
};

/** Astronomical symbols where they exist (an atlas would print them). */
export const GLYPH: Record<string, string> = {
  sun: '☉',
  mercury: '☿',
  venus: '♀',
  earth: '♁',
  moon: '☾',
  mars: '♂',
  ceres: '⚳',
  jupiter: '♃',
  saturn: '♄',
  uranus: '⛢',
  neptune: '♆',
  pluto: '♇',
  halley: '☄',
};

export const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII', 'XXIV', 'XXV', 'XXVI', 'XXVII', 'XXVIII', 'XXIX', 'XXX', 'XXXI', 'XXXII', 'XXXIII', 'XXXIV', 'XXXV'];
