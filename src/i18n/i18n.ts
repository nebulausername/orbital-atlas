import { en, type Key } from './en';
import { de } from './de';

export type Lang = 'en' | 'de';
const DICTS: Record<Lang, Record<Key, string>> = { en, de };

let lang: Lang = detect();
const listeners = new Set<(l: Lang) => void>();

function detect(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'de' || q === 'en') return q;
  return navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export const getLang = () => lang;
export const locale = () => (lang === 'de' ? 'de-DE' : 'en-GB');

export function setLang(l: Lang) {
  if (l === lang) return;
  lang = l;
  document.documentElement.lang = l;
  listeners.forEach((f) => f(l));
}

export function onLang(f: (l: Lang) => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Translate with {placeholders}. */
export function t(key: Key, params?: Record<string, string | number>): string {
  let s: string = DICTS[lang][key] ?? en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Translate a dynamic key (body names, layers …); falls back to the raw id. */
export function tk(key: string, params?: Record<string, string | number>): string {
  return key in en ? t(key as Key, params) : key;
}

export function fmt(n: number, digits = 0, opts: Intl.NumberFormatOptions = {}) {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits, ...opts }).format(n);
}

/** Significant-figure formatting with thin grouping. */
export function fmtSig(n: number, sig = 3) {
  if (n === 0) return '0';
  const d = Math.max(0, sig - 1 - Math.floor(Math.log10(Math.abs(n))));
  return fmt(n, Math.min(d, 6));
}

/** 1.989e30 → "1.989 × 10³⁰" */
export function fmtSci(n: number, sig = 4) {
  const e = Math.floor(Math.log10(Math.abs(n)));
  const m = n / 10 ** e;
  const sup = String(e).replace(/[-0-9]/g, (c) => '⁻⁰¹²³⁴⁵⁶⁷⁸⁹'['-0123456789'.indexOf(c)]);
  return `${fmt(m, sig - 1)} × 10${sup}`;
}

export type { Key };
