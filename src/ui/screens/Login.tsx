import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { cloudConfigured } from '@/data/cloud/config';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { RidgeLine } from '@/ui/components/RidgeLine';
import { useCloudModule, useCloudState } from '@/ui/hooks/useCloud';
import { AuthForm, NewPassword, type Mode } from './Account';

/** Écran de connexion / inscription plein écran. */
export function Login() {
  const [params] = useSearchParams();
  const initialMode: Mode = params.get('mode') === 'signup' ? 'signup' : 'signin';
  return (
    <div className="flex min-h-[90dvh] flex-col gap-6 pt-4">
      <Link to="/" className="text-sm text-muted hover:text-text">← Accueil</Link>
      <div className="space-y-3">
        <RidgeLine className="h-10 w-36 text-text" />
        <h1 className="text-4xl font-semibold">{initialMode === 'signup' ? 'Créer un compte' : 'Connexion'}</h1>
        <p className="text-muted">Retrouve tes plans sur tous tes appareils, ton coach et tes amis.</p>
      </div>
      {cloudConfigured ? <CloudLogin initialMode={initialMode} /> : <NotAvailable />}
      <p className="mt-auto text-xs text-muted">Sans compte, rien ne quitte ton appareil. Avec un compte, tes données sont synchronisées et restent privées : tu choisis ce que tu partages, et tu peux tout supprimer en tout temps.</p>
    </div>
  );
}

function CloudLogin({ initialMode }: { initialMode: Mode }) {
  const mod = useCloudModule();
  const cloud = useCloudState(mod);
  const navigate = useNavigate();
  const signedIn = Boolean(cloud.session) && !cloud.recovery;

  // Connecté et première synchro terminée : on file vers l'app.
  useEffect(() => {
    if (signedIn && cloud.sync !== 'syncing') navigate('/', { replace: true });
  }, [signedIn, cloud.sync, navigate]);

  if (!mod || !cloud.ready) return <Card><p className="text-sm text-muted">Chargement…</p></Card>;
  if (cloud.session && cloud.recovery) return <NewPassword mod={mod} />;
  if (signedIn) return <Card><p role="status">Connecté. On récupère tes données…</p></Card>;
  return (
    <Card>
      <AuthForm mod={mod} initialMode={initialMode} />
    </Card>
  );
}

function NotAvailable() {
  const navigate = useNavigate();
  return (
    <Card className="space-y-3">
      <p className="font-medium">Les comptes ne sont pas encore activés sur ce site.</p>
      <p className="text-sm text-muted">Pas besoin d'attendre : Sentier fonctionne au complet sans compte, et tes données restent sur ton appareil. Tu pourras créer un compte plus tard sans rien perdre.</p>
      <Button onClick={() => navigate('/')}>Commencer sans compte</Button>
    </Card>
  );
}
