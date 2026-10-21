import Papa from 'papaparse';
import type { Sport } from '@/engine/types';
import type { ParsedActivity } from './types';

/**
 * Export CSV de la liste d'activités de Garmin Connect (une ligne par activité, résumé seulement).
 * Les en-têtes varient selon la langue du compte : on accepte l'anglais et le français.
 */
const COLS = {
  type: ['Activity Type', "Type d'activité"],
  date: ['Date'],
  title: ['Title', 'Titre'],
  distance: ['Distance'],
  time: ['Time', 'Durée', 'Temps'],
  hrAvg: ['Avg HR', 'Fréquence cardiaque moyenne', 'FC moyenne'],
  hrMax: ['Max HR', 'Fréquence cardiaque maximale', 'FC max'],
  cadence: ['Avg Run Cadence', 'Cadence de course moyenne'],
  ascent: ['Total Ascent', 'Ascension totale', 'Dénivelé positif total'],
  descent: ['Total Descent', 'Descente totale', 'Dénivelé négatif total'],
  load: ['Training Load', "Charge d'entraînement"],
} as const;

function get(row: Record<string, string>, keys: readonly string[]): string | undefined {
  for (const k of keys) if (row[k] !== undefined && row[k] !== '--' && row[k] !== '') return row[k];
  return undefined;
}

/** « 1,234.5 » ou « 1 234,5 » → 1234.5 */
export function parseNumber(v: string | undefined): number | undefined {
  if (!v) return undefined;
  let s = v.replace(/\s| /g, '');
  if (/,\d{1,2}$/.test(s) && !s.includes('.')) s = s.replace(',', '.');
  s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** « 01:02:03 », « 45:10 » ou « 45:10.5 » → secondes */
export function parseDuration(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const parts = v.split(':').map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return undefined;
  return Math.round(parts.reduce((acc, p) => acc * 60 + p, 0));
}

function sportOf(type = ''): Sport {
  const t = type.toLowerCase();
  if (t.includes('trail')) return 'trail';
  if (t.includes('run') || t.includes('course')) return 'course';
  if (t.includes('cycl') || t.includes('vélo') || t.includes('bik')) return 'velo';
  if (t.includes('swim') || t.includes('natation')) return 'natation';
  if (t.includes('hik') || t.includes('walk') || t.includes('randonn') || t.includes('marche')) return 'marche';
  if (t.includes('strength') || t.includes('musculation')) return 'muscu';
  return 'autre';
}

export function parseGarminCsv(text: string): ParsedActivity[] {
  const { data } = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: true });
  const out: ParsedActivity[] = [];
  for (const row of data) {
    const date = get(row, COLS.date);
    const start = date ? new Date(date.replace(' ', 'T')) : null;
    const durationSec = parseDuration(get(row, COLS.time));
    if (!start || Number.isNaN(start.getTime()) || !durationSec) continue;
    const sport = sportOf(get(row, COLS.type));
    const cadence = parseNumber(get(row, COLS.cadence));
    out.push({
      source: 'csv',
      sport,
      ...(sport === 'trail' ? { terrain: 'sentier' as const } : {}),
      name: get(row, COLS.title),
      startTime: start.toISOString(),
      durationSec,
      distanceKm: parseNumber(get(row, COLS.distance)) ?? 0,
      elevationGainM: parseNumber(get(row, COLS.ascent)) ?? 0,
      elevationLossM: parseNumber(get(row, COLS.descent)) ?? 0,
      hrAvg: parseNumber(get(row, COLS.hrAvg)),
      hrMax: parseNumber(get(row, COLS.hrMax)),
      cadenceAvg: cadence,
      garminTrainingLoad: parseNumber(get(row, COLS.load)),
    });
  }
  return out;
}
