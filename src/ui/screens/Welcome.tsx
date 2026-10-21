import { useState } from 'react';
import { useNavigate } from 'react-router';
import { db } from '@/data/db';
import { createBlankAthlete } from '@/data/athlete';
import { loadDemo } from '@/data/seed/demo';
import { Button } from '@/ui/components/Button';
import { RidgeLine } from '@/ui/components/RidgeLine';
import { t } from '@/ui/lib/strings';

export function Welcome() {
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const run = (fn: () => Promise<unknown>) => async () => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[80dvh] flex-col justify-center gap-8">
      <RidgeLine className="h-16 w-56 text-text" />
      <div className="space-y-3">
        <h1 className="text-5xl font-semibold">Sentier</h1>
        <p className="text-lg text-muted">
          Un plan de course qui s'adapte à ta vie. Route ou trail, 5 km ou ultra, de zéro ou avec ton historique.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Button size="lg" disabled={busy} onClick={run(async () => {
          await createBlankAthlete(db);
          navigate('/objectif');
        })}>
          Commencer
        </Button>
        <Button size="lg" variant="secondary" disabled={busy} onClick={run(() => loadDemo(db))}>
          Explorer avec des données de démo
        </Button>
      </div>
      <p className="text-sm text-muted">{t.privacy}</p>
    </div>
  );
}
