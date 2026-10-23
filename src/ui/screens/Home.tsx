import { lazy, Suspense } from 'react';
import { useActiveAthlete } from '@/ui/hooks/useAthlete';
import { Welcome } from './Welcome';

// Le tableau de bord (moteur, jalons, nutrition…) ne se charge qu'une fois un profil créé : la 1re visite reste légère.
const Today = lazy(async () => ({ default: (await import('./Today')).Today }));

function Skeleton() {
  return (
    <div className="space-y-5" role="status" aria-busy="true" aria-label="Chargement">
      <div className="h-10 w-48 animate-pulse rounded-lg bg-surface" />
      <div className="h-48 animate-pulse rounded-[var(--radius-card)] bg-surface" />
    </div>
  );
}

/** Accueil : présentation tant qu'il n'y a pas de profil, tableau de bord ensuite. */
export function Home() {
  const athlete = useActiveAthlete();
  if (athlete === undefined) return <Skeleton />;
  if (athlete === null) return <Welcome />;
  return (
    <Suspense fallback={<Skeleton />}>
      <Today />
    </Suspense>
  );
}
