import type { ISODate } from '@/engine';

/** Course du répertoire du Québec (faits + lien vers la page source ; voir scripts/import-races.mjs). */
export interface CatalogRace {
  id: string;
  name: string;
  date: ISODate;
  endDate?: ISODate;
  city: string;
  lat?: number;
  lng?: number;
  kind: 'route' | 'trail';
  distancesKm: number[];
  url: string;
  sources: string[];
}

export interface RaceCatalog {
  generatedAt: ISODate;
  sources: { id: string; url: string }[];
  races: CatalogRace[];
}

/** Chargé à la demande : le répertoire n'alourdit pas le démarrage de l'app. */
export async function loadRaceCatalog(): Promise<RaceCatalog> {
  return (await import('./quebec.json')).default as RaceCatalog;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Courses à venir (à partir de `from`) dont le nom ou la ville contient la recherche (sans accents ni casse). */
export function searchRaces(races: CatalogRace[], query: string, from: ISODate, kind?: 'route' | 'trail', limit = 20): CatalogRace[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return races
    .filter((r) => (r.endDate ?? r.date) >= from && (!kind || r.kind === kind))
    .filter((r) => words.every((w) => fold(`${r.name} ${r.city}`).includes(w)))
    .slice(0, limit);
}

/** Distance du répertoire la plus proche de la distance de l'objectif choisi (pour pré-remplir la course). */
export function closestDistance(race: CatalogRace, targetKm: number): number | undefined {
  if (!race.distancesKm.length) return undefined;
  return race.distancesKm.reduce((best, d) => (Math.abs(d - targetKm) < Math.abs(best - targetKm) ? d : best));
}
