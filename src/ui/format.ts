import { AU_KM, LY_AU, unixMsFromJd } from '../core/units';
import { RATES, RATE_UNITS } from '../core/store';
import { fmt, fmtSig, getLang, locale, t, type Key } from '../i18n/i18n';

/** A distance in AU as the most readable unit. */
export function distance(au: number): string {
  const km = au * AU_KM;
  if (km < 1e6) return `${fmt(km, 0)} ${t('misc.km')}`;
  if (au < 0.1) return `${fmtSig(km / 1e6, 3)} ${getLang() === 'de' ? 'Mio. km' : 'million km'}`;
  if (au < 30_000) return `${fmtSig(au, 3)} ${t('misc.au')}`;
  return `${fmtSig(au / LY_AU, 3)} ${t('misc.ly')}`;
}

export function distanceShort(au: number): string {
  const km = au * AU_KM;
  if (au < 0.01) return `${fmtSig(km, 2)} km`;
  if (au < 30_000) return `${fmtSig(au, 2)} ${t('misc.au')}`;
  return `${fmtSig(au / LY_AU, 2)} ${t('misc.ly')}`;
}

/** Light travel time for a distance in AU. */
export function lightTime(au: number): string {
  const s = (au * AU_KM) / 299_792.458;
  if (s < 120) return `${fmt(s, 1)} s`;
  if (s < 7200) return `${fmt(s / 60, 1)} ${t('misc.lightMin')}`;
  return `${fmt(s / 3600, 2)} ${t('misc.lightH')}`;
}

export function dateParts(jd: number) {
  const d = new Date(unixMsFromJd(jd));
  const loc = locale();
  const year = d.getUTCFullYear();
  const date = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
  const time = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' }).format(d);
  const weekday = new Intl.DateTimeFormat(loc, { weekday: 'long', timeZone: 'UTC' }).format(d);
  return { date, time, weekday, year, iso: d.toISOString().slice(0, 10) };
}

export function rateLabel(idx: number, dir: 1 | -1): string {
  if (idx === 0) return `${dir < 0 ? '−' : ''}${t('time.live')}`;
  const unit = t(RATE_UNITS[idx] as Key);
  const rate = /^\d/.test(unit) ? unit : `1 ${unit}`;
  return `${dir < 0 ? '−' : ''}${t('time.perSecond', { rate })}`;
}

export const rateSeconds = (idx: number) => RATES[idx];
