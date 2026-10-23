import { useEffect, useMemo, useState } from 'react';
import { loadRaceCatalog, searchRaces, type CatalogRace, type RaceCatalog } from '@/data/races';
import type { ISODate } from '@/engine';
import { TextInput } from './forms';

/** Cherche une course dans le répertoire du Québec (hors ligne) et pré-remplit nom, date et distance. */
export function RacePicker({ today, kind, onPick }: { today: ISODate; kind: 'route' | 'trail'; onPick: (race: CatalogRace) => void }) {
  const [catalog, setCatalog] = useState<RaceCatalog | null>(null);
  const [query, setQuery] = useState('');
  useEffect(() => {
    void loadRaceCatalog().then(setCatalog);
  }, []);
  const results = useMemo(() => (catalog ? searchRaces(catalog.races, query, today, kind, 8) : []), [catalog, query, today, kind]);
  return (
    <section aria-label="Répertoire des courses du Québec" className="space-y-2 rounded-2xl border border-line p-3">
      <p className="text-sm font-medium">Trouver une course au Québec</p>
      <TextInput type="search" placeholder="Nom ou ville (ex. Grand-Duc, Gatineau)" aria-label="Rechercher une course" value={query} onChange={(e) => setQuery(e.target.value)} />
      {!catalog ? (
        <p className="text-sm text-muted">Chargement du répertoire…</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-muted">Aucune course {kind === 'trail' ? 'en sentier' : 'sur route'} trouvée. Tu peux saisir la tienne ci-dessous.</p>
      ) : (
        <ul className="space-y-1.5">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => onPick(r)} className="w-full rounded-xl bg-surface-2 p-3 text-left hover:bg-line">
                <span className="block font-medium">{r.name}</span>
                <span className="block text-xs text-muted">{r.dateConfirmed === false ? `≈ ${r.date} (date à confirmer)` : r.date}{r.endDate ? ` → ${r.endDate}` : ''} · {r.city || r.region || 'Québec'}{r.distancesKm.length ? ` · ${r.distancesKm.map((d) => `${d} km${r.gainByKm?.[String(d)] ? ` (D+ ${r.gainByKm[String(d)]} m)` : ''}`).join(', ')}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {catalog && <p className="text-xs text-muted">Répertoire du {catalog.generatedAt}, d'après {catalog.sources.map((s) => s.id).join(', ')}. Vérifie date, distances et inscription sur le site de l'organisateur.</p>}
    </section>
  );
}
