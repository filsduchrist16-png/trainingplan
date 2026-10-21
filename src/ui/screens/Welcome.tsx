import { useState } from 'react';
import { useNavigate } from 'react-router';
import { m } from 'motion/react';
import { db } from '@/data/db';
import { createBlankAthlete } from '@/data/athlete';
import { loadDemo } from '@/data/seed/demo';
import { Button } from '@/ui/components/Button';
import { ElevationProfile } from '@/ui/components/ElevationProfile';
import { useCloudModule, useCloudState } from '@/ui/hooks/useCloud';
import { t } from '@/ui/lib/strings';

// Une ligne de crête stylisée (décor), pas un vrai parcours.
const RIDGE: [number, number][] = Array.from({ length: 80 }, (_, i) => [i, 300 + 140 * Math.sin(i / 9) + 70 * Math.sin(i / 3.3 + 1) + 40 * Math.sin(i / 1.7)]);

const FEATURES = [
  { icon: '⛰️', title: 'Route ou trail, du 5 km à l’ultra', text: 'Un plan périodisé vers ta course, ou juste pour garder la forme.' },
  { icon: '😴', title: 'Nuit courte? Le plan s’ajuste', text: 'Dis comment tu te sens en 2 taps : la séance du jour s’adapte.' },
  { icon: '🦴', title: 'La santé avant tout', text: 'Une douleur au tibia bloque les séances dures, tout de suite.' },
  { icon: '💡', title: 'Chaque séance a son pourquoi', text: 'Pas de boîte noire : le moteur explique toutes ses décisions.' },
];

/** Page d'accueil : présentation, commencer sans compte, se connecter, ou explorer la démo. */
export function Welcome() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const mod = useCloudModule();
  const cloud = useCloudState(mod);
  const email = cloud.session?.user.email;

  const run = (fn: () => Promise<unknown>) => async () => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const start = run(async () => {
    await createBlankAthlete(db);
    navigate('/objectif');
  });

  return (
    <div className="flex min-h-[92dvh] flex-col">
      <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} className="-mx-4 mb-2">
        <ElevationProfile points={RIDGE} className="h-36 w-full" label="Ligne de crête" />
      </m.div>

      <div className="space-y-3">
        <h1 className="text-6xl font-semibold tracking-tight">Sentier</h1>
        <p className="text-xl text-muted">Ton plan de course qui s'adapte à ta vie. Pas l'inverse.</p>
      </div>

      <ul className="mt-8 space-y-4">
        {FEATURES.map((f, i) => (
          <m.li key={f.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.08 }} className="flex gap-3">
            <span aria-hidden className="text-2xl">{f.icon}</span>
            <div>
              <p className="font-medium">{f.title}</p>
              <p className="text-sm text-muted">{f.text}</p>
            </div>
          </m.li>
        ))}
      </ul>

      <div className="mt-10 flex flex-col gap-3">
        {email ? (
          <>
            <p className="text-sm text-muted">Connecté : {email}. Crée ton profil pour bâtir ton premier plan.</p>
            <Button size="lg" disabled={busy} onClick={start}>Créer mon profil</Button>
          </>
        ) : (
          <>
            <Button size="lg" disabled={busy} onClick={start}>Commencer</Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/connexion')}>J'ai déjà un compte</Button>
          </>
        )}
        <button type="button" disabled={busy} onClick={run(() => loadDemo(db))} className="py-2 text-sm text-muted underline underline-offset-4 hover:text-text">
          Explorer avec des données de démo
        </button>
      </div>

      <p className="mt-auto pt-8 text-xs text-muted">{t.privacy} Aucun compte requis pour commencer.</p>
    </div>
  );
}
