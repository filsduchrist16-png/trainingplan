import type { ISODate, Weekday } from './types';

/**
 * Arithmétique sur des jours calendaires `YYYY-MM-DD`, en UTC pur :
 * aucun décalage dû au fuseau ou à l'heure d'été.
 */

const DAY_MS = 86_400_000;

function toUtc(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, day);
}

function fromUtc(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUtc(toUtc(d) + n * DAY_MS);
}

/** Nombre de jours de `a` à `b` (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** Jour ISO : 1 = lundi … 7 = dimanche. */
export function weekday(d: ISODate): Weekday {
  const js = new Date(toUtc(d)).getUTCDay();
  return (js === 0 ? 7 : js) as Weekday;
}

export function mondayOf(d: ISODate): ISODate {
  return addDays(d, 1 - weekday(d));
}

/** Date du jour `wd` dans la semaine qui commence au lundi `monday`. */
export function dayOfWeek(monday: ISODate, wd: Weekday): ISODate {
  return addDays(monday, wd - 1);
}

/** Jour calendaire local d'un objet Date (pour la frontière avec l'UI). */
export function toIsoDate(date: Date): ISODate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isBetween(d: ISODate, from: ISODate, to: ISODate): boolean {
  return d >= from && d <= to;
}
