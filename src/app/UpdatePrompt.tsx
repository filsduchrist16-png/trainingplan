import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/ui/components/Button';

/** Invite discrète quand une nouvelle version de l'app est prête (rien ne se recharge sans ton accord). */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  // « Prêt hors-ligne » est une info : elle disparaît seule. La mise à jour, elle, attend ton accord.
  useEffect(() => {
    if (!offlineReady) return;
    const t = setTimeout(() => setOfflineReady(false), 4000);
    return () => clearTimeout(t);
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh && !offlineReady) return null;
  return (
    <div role="status" className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface-2 p-4 shadow-xl">
      <p className="flex-1 text-sm">
        {needRefresh ? 'Nouvelle version de Sentier prête.' : 'Sentier marche maintenant hors-ligne.'}
      </p>
      {needRefresh && (
        <Button size="sm" onClick={() => updateServiceWorker(true)}>
          Mettre à jour
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => (setNeedRefresh(false), setOfflineReady(false))}>
        OK
      </Button>
    </div>
  );
}
