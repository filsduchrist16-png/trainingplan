import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { db } from '@/data/db';
import { importFiles, linkActivity, type ImportOutcome } from '@/data/import';
import { Button } from '@/ui/components/Button';
import { Card, Eyebrow } from '@/ui/components/Card';
import { useActiveAthlete } from '@/ui/hooks/useAthlete';
import { cn } from '@/ui/lib/cn';
import { t } from '@/ui/lib/strings';

export function Import() {
  const athlete = useActiveAthlete();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImportOutcome[]>([]);
  const [linked, setLinked] = useState<Set<string>>(new Set());
  if (!athlete) return null;

  async function handle(files: FileList | null) {
    if (!files?.length || !athlete) return;
    setBusy(true);
    try {
      const payload = await Promise.all([...files].map(async (f) => ({ name: f.name, data: f.name.toLowerCase().endsWith('.fit') ? await f.arrayBuffer() : await f.text() })));
      setResults(await importFiles(db, athlete, payload));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={() => navigate(-1)} className="text-sm text-muted hover:text-text">← Retour</button>
      <h1 className="text-3xl font-semibold">Importer</h1>
      <p className="text-muted">Fichiers Garmin : FIT (le plus complet), GPX, TCX, ou le CSV de ta liste d'activités Garmin Connect. Plusieurs à la fois, c'est correct.</p>
      <div
        role="button"
        tabIndex={0}
        aria-label="Déposer des fichiers ou choisir"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void handle(e.dataTransfer.files); }}
        className={cn('flex cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed p-10 text-center transition', over ? 'border-accent bg-accent/5' : 'border-line hover:border-muted')}
      >
        <span aria-hidden className="text-4xl">⛰️</span>
        <p className="font-medium">{busy ? 'Lecture en cours…' : 'Dépose tes fichiers ici'}</p>
        <p className="text-sm text-muted">ou touche pour choisir</p>
        <input ref={input} type="file" multiple accept=".fit,.gpx,.tcx,.csv" className="hidden" onChange={(e) => { void handle(e.target.files); e.target.value = ''; }} />
      </div>
      <p className="rounded-xl bg-ok/10 p-3 text-sm text-ok">🔒 {t.privacy}</p>

      {results.length > 0 && (
        <Card className="space-y-3">
          <Eyebrow>Résultat</Eyebrow>
          <ul className="space-y-3">
            {results.map((r) => (
              <li key={r.file} className="space-y-2">
                <p className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{r.file}</span>
                  <span className={cn('shrink-0', r.status === 'ok' ? 'text-ok' : r.status === 'doublon' ? 'text-muted' : 'text-danger')}>{r.status === 'ok' ? '✓' : r.status === 'doublon' ? 'doublon' : 'erreur'}</span>
                </p>
                <p className="text-sm text-muted">{r.message}</p>
                {r.matches.map((mt) => (
                  <div key={mt.activityId} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-3 text-sm">
                    {linked.has(mt.activityId) ? (
                      <span className="text-ok">Associée à « {mt.title} ».</span>
                    ) : (
                      <>
                        <span className="flex-1">C'était « {mt.title} »?</span>
                        <Button size="sm" onClick={async () => { await linkActivity(db, mt.sessionId, mt.activityId); setLinked(new Set([...linked, mt.activityId])); }}>Oui, associer</Button>
                      </>
                    )}
                  </div>
                ))}
                {r.activityIds.length === 1 && <Button size="sm" variant="secondary" onClick={() => navigate(`/activite/${r.activityIds[0]}`)}>Voir le debrief</Button>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <details className="text-sm text-muted">
        <summary className="cursor-pointer">Où trouver mes fichiers Garmin?</summary>
        <p className="mt-2">Garmin Connect (web) → ouvre une activité → ⚙️ → « Exporter l'original » (FIT) ou « Exporter en GPX/TCX ». Pour tout ton historique d'un coup : liste des activités → « Exporter au format CSV ».</p>
      </details>
    </div>
  );
}
