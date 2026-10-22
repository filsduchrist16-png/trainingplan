import {
  PROGRESS_COMPARE_WEEKS, PROGRESS_DISTRIBUTION_TOLERANCE, PROGRESS_DISTRIBUTION_WEEKS, PROGRESS_EASY_MAX_GAIN_PER_KM, PROGRESS_EASY_MIN_SHARE,
  PROGRESS_MIN_ACTIVITIES, PROGRESS_MIN_PACE_GAIN_SEC, PROGRESS_RESTING_HR_ALERT, PROGRESS_TARGET_LOW_SHARE, PROGRESS_VO2_SMOOTHING,
} from './constants';
import { addDays, diffDays, mondayOf } from './dates';
import { explain } from './explain';
import { formatPace } from './paces';
import type { Explanation, ISODate, Sport } from './types';

/**
 * Progrès : tendances et « découvertes » calculées par règles, sans boîte noire.
 * Efficacité aérobie (allure à FC égale), distribution des zones vs 80/10/10, cadence, VO2max, FC repos.
 */

export interface ProgressActivity {
  date: ISODate;
  sport: Sport;
  durationSec: number;
  movingSec?: number;
  distanceKm: number;
  elevationGainM: number;
  hrAvg?: number;
  cadenceAvg?: number;
  timeInZonesSec?: [number, number, number, number, number];
}

const isRun = (a: ProgressActivity) => a.sport === 'course' || a.sport === 'trail';
const secOf = (a: ProgressActivity) => a.movingSec ?? a.durationSec;
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const pace = (speedMPerMin: number) => 1000 / speedMPerMin;

// ─── Efficacité aérobie ───────────────────────────────────────────────────────

export interface EfficiencyPoint {
  monday: ISODate;
  /** Allure (min/km) estimée à la FC de référence. */
  paceAtRef: number;
  activities: number;
}

export interface Efficiency {
  points: EfficiencyPoint[];
  /** Variation en s/km à FC égale (négatif = plus rapide) entre les N dernières semaines et les N d'avant. */
  deltaSecPerKm?: number;
  recentPace?: number;
  previousPace?: number;
  refHr: number;
  discovery?: Explanation;
}

/** Sorties faciles, sur terrain roulant, avec FC : base de l'efficacité (vitesse ÷ FC). */
export function easyActivities(acts: ProgressActivity[]): ProgressActivity[] {
  return acts.filter((a) => {
    if (!isRun(a) || !a.hrAvg || a.distanceKm <= 0 || secOf(a) <= 0) return false;
    if (a.elevationGainM / a.distanceKm > PROGRESS_EASY_MAX_GAIN_PER_KM) return false;
    const z = a.timeInZonesSec;
    const total = z?.reduce((s, x) => s + x, 0) ?? 0;
    return total > 0 && (z![0] + z![1]) / total >= PROGRESS_EASY_MIN_SHARE;
  });
}

export function aerobicEfficiency(acts: ProgressActivity[], refHr: number, today: ISODate): Efficiency {
  const easy = easyActivities(acts);
  const byWeek = new Map<ISODate, { ef: number; sec: number; n: number }>();
  for (const a of easy) {
    const monday = mondayOf(a.date);
    const speed = (a.distanceKm * 1000) / (secOf(a) / 60); // m/min
    const w = byWeek.get(monday) ?? { ef: 0, sec: 0, n: 0 };
    w.ef += (speed / a.hrAvg!) * secOf(a);
    w.sec += secOf(a);
    w.n++;
    byWeek.set(monday, w);
  }
  const points: EfficiencyPoint[] = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([monday, w]) => ({ monday, paceAtRef: round(pace((w.ef / w.sec) * refHr), 2), activities: w.n }));
  // Récent : les N dernières semaines ; précédent : les N d'avant.
  const cut = addDays(mondayOf(today), -(PROGRESS_COMPARE_WEEKS - 1) * 7);
  const prevFrom = addDays(cut, -PROGRESS_COMPARE_WEEKS * 7);
  const range = (from: ISODate, to: ISODate) => points.filter((p) => p.monday >= from && p.monday < to);
  const recent = range(cut, addDays(mondayOf(today), 7));
  const previous = range(prevFrom, cut);
  const count = (ps: EfficiencyPoint[]) => ps.reduce((s, p) => s + p.activities, 0);
  const mean = (ps: EfficiencyPoint[]) => ps.reduce((s, p) => s + p.paceAtRef * p.activities, 0) / count(ps);
  const out: Efficiency = { points, refHr };
  if (count(recent) < PROGRESS_MIN_ACTIVITIES || count(previous) < PROGRESS_MIN_ACTIVITIES) return out;
  const recentPace = mean(recent);
  const previousPace = mean(previous);
  const delta = Math.round((recentPace - previousPace) * 60);
  Object.assign(out, { recentPace: round(recentPace, 2), previousPace: round(previousPace, 2), deltaSecPerKm: delta });
  if (Math.abs(delta) >= PROGRESS_MIN_PACE_GAIN_SEC) {
    const faster = delta < 0;
    out.discovery = explain(
      faster ? 'progress.efficiency.up' : 'progress.efficiency.down', faster ? 'info' : 'conseil',
      faster ? `Ton Z2 est ${-delta} s/km plus rapide` : `Ton Z2 est ${delta} s/km plus lent`,
      faster
        ? `À ${refHr} bpm, tu cours maintenant à ${formatPace(recentPace)} /km, contre ${formatPace(previousPace)} /km les ${PROGRESS_COMPARE_WEEKS} semaines d'avant. Ton moteur aérobie progresse, sans que la FC monte.`
        : `À ${refHr} bpm, tu cours à ${formatPace(recentPace)} /km, contre ${formatPace(previousPace)} /km avant. Fatigue, chaleur, sommeil ou charge élevée : rien d'alarmant seul, mais garde tes sorties vraiment faciles.`,
      { delta, ref: refHr },
    );
  }
  return out;
}

// ─── Distribution des zones ───────────────────────────────────────────────────

export interface ZoneDistribution {
  /** Part du temps dans chaque zone Z1..Z5 (somme = 1). */
  shares: [number, number, number, number, number];
  low: number;
  mid: number;
  high: number;
  minutes: number;
  discovery?: Explanation;
}

/** Temps par zone des N dernières semaines, comparé à 80 % facile / 10 % soutenu / 10 % dur. */
export function zoneDistribution(acts: ProgressActivity[], today: ISODate): ZoneDistribution | undefined {
  const from = addDays(mondayOf(today), -(PROGRESS_DISTRIBUTION_WEEKS - 1) * 7);
  const sum: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const a of acts) {
    if (!isRun(a) || a.date < from || !a.timeInZonesSec) continue;
    a.timeInZonesSec.forEach((s, i) => { sum[i]! += s; });
  }
  const total = sum.reduce((s, x) => s + x, 0);
  if (total === 0) return undefined;
  const shares = sum.map((s) => round(s / total, 3)) as ZoneDistribution['shares'];
  const low = shares[0] + shares[1];
  const mid = shares[2];
  const high = shares[3] + shares[4];
  const out: ZoneDistribution = { shares, low: round(low, 3), mid: round(mid, 3), high: round(high, 3), minutes: Math.round(total / 60) };
  const pct = (x: number) => Math.round(x * 100);
  if (low < PROGRESS_TARGET_LOW_SHARE - PROGRESS_DISTRIBUTION_TOLERANCE) {
    out.discovery = explain('progress.distribution.hard', 'conseil', 'Trop de temps soutenu', `${pct(low)} % de ton temps en Z1-Z2 (visé : ${pct(PROGRESS_TARGET_LOW_SHARE)} %), dont ${pct(mid)} % en Z3, la zone grise. Ralentis tes sorties faciles : c'est elles qui construisent l'endurance, et elles te gardent frais pour les séances dures.`, { facile: pct(low), moyen: pct(mid), dur: pct(high) });
  } else if (low > 0.95) {
    out.discovery = explain('progress.distribution.easy', 'info', 'Que du facile', `${pct(low)} % de ton temps en Z1-Z2 : excellent pour la base. Quand ton plan le demande, ajoute un peu d'intensité (seuil ou côtes) pour garder de la vivacité.`, { facile: pct(low) });
  } else {
    out.discovery = explain('progress.distribution.ok', 'info', 'Bonne répartition', `${pct(low)} % facile, ${pct(mid)} % soutenu, ${pct(high)} % dur : proche du 80/10/10 qui réussit à la plupart des coureurs.`, { facile: pct(low), moyen: pct(mid), dur: pct(high) });
  }
  return out;
}

// ─── Cadence ──────────────────────────────────────────────────────────────────

export interface CadencePoint {
  monday: ISODate;
  spm: number;
}

/** Cadence moyenne par semaine (pondérée par la durée), course et trail seulement. */
export function cadenceByWeek(acts: ProgressActivity[]): CadencePoint[] {
  const byWeek = new Map<ISODate, { spm: number; sec: number }>();
  for (const a of acts) {
    if (!isRun(a) || !a.cadenceAvg) continue;
    const monday = mondayOf(a.date);
    const w = byWeek.get(monday) ?? { spm: 0, sec: 0 };
    w.spm += a.cadenceAvg * secOf(a);
    w.sec += secOf(a);
    byWeek.set(monday, w);
  }
  return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([monday, w]) => ({ monday, spm: Math.round(w.spm / w.sec) }));
}

// ─── VO2max ───────────────────────────────────────────────────────────────────

export interface Vo2Point {
  date: ISODate;
  value: number;
  /** Moyenne glissante sur `PROGRESS_VO2_SMOOTHING` points. */
  smoothed: number;
}

export function vo2maxSeries(history: { date: ISODate; value: number }[]): Vo2Point[] {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((p, i) => {
    const win = sorted.slice(Math.max(0, i - PROGRESS_VO2_SMOOTHING + 1), i + 1);
    return { ...p, smoothed: round(win.reduce((s, x) => s + x.value, 0) / win.length) };
  });
}

// ─── FC repos et VFC ──────────────────────────────────────────────────────────

export interface RestingHr {
  recent: number;
  baseline: number;
  delta: number;
  discovery?: Explanation;
}

/** FC repos : moyenne des 7 derniers jours contre la base des 28 jours d'avant. */
export function restingHrTrend(wellness: { date: ISODate; hrRest?: number }[], today: ISODate): RestingHr | undefined {
  const vals = (from: number, to: number) => wellness.filter((w) => w.hrRest !== undefined && diffDays(w.date, today) >= from && diffDays(w.date, today) < to).map((w) => w.hrRest!);
  const recent = vals(0, 7);
  const base = vals(7, 35);
  if (recent.length < 3 || base.length < 7) return undefined;
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const out: RestingHr = { recent: round(avg(recent)), baseline: round(avg(base)), delta: round(avg(recent) - avg(base)) };
  if (out.delta >= PROGRESS_RESTING_HR_ALERT) out.discovery = explain('progress.restinghr.up', 'attention', 'FC repos élevée', `Ta FC au repos est à ${out.recent} bpm cette semaine, ${out.delta} de plus que ta base (${out.baseline}). Fatigue accumulée, manque de sommeil, stress ou début de maladie : allège les séances dures et dors plus.`, { delta: out.delta });
  else if (out.delta <= -PROGRESS_RESTING_HR_ALERT) out.discovery = explain('progress.restinghr.down', 'info', 'FC repos en baisse', `${-out.delta} bpm de moins que ta base (${out.recent} contre ${out.baseline}) : signe classique d'une forme aérobie qui monte, si tu te sens bien.`, { delta: out.delta });
  return out;
}

/** VFC : nombre de jours déséquilibrés ou bas sur les 7 derniers jours. */
export function hrvDays(wellness: { date: ISODate; hrv?: 'equilibre' | 'desequilibre' | 'bas' | 'faible' }[], today: ISODate): { total: number; bad: number } {
  const week = wellness.filter((w) => w.hrv && diffDays(w.date, today) >= 0 && diffDays(w.date, today) < 7);
  return { total: week.length, bad: week.filter((w) => w.hrv !== 'equilibre').length };
}
