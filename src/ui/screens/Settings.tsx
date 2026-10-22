import { lazy, Suspense, useRef, useState } from 'react';
import { Link } from 'react-router';
import { db, requestPersistence } from '@/data/db';
import { cloudConfigured } from '@/data/cloud/config';
import { clearDemo } from '@/data/seed/demo';
import { Button } from '@/ui/components/Button';
import { Card, Eyebrow } from '@/ui/components/Card';
import { useIsDemo } from '@/ui/hooks/useAthlete';
import { useTheme, type ThemePref } from '@/ui/hooks/useTheme';
import { t } from '@/ui/lib/strings';
import { cn } from '@/ui/lib/cn';

// Chargé seulement si les comptes sont activés : l'app locale n'embarque pas ce code.
const Account = lazy(async () => ({ default: (await import('./Account')).Account }));

export function Settings() {
  const { pref, setPref } = useTheme();
  const isDemo = useIsDemo();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function onExport() {
    // Chargé à la demande : la validation (zod) n'alourdit pas le démarrage de l'app.
    const { backupFileName, exportBackup } = await import('@/data/backup');
    const backup = await exportBackup(db);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName();
    a.click();
    URL.revokeObjectURL(url);
    await db.meta.put({ key: 'lastBackupAt', value: new Date().toISOString() });
    setMessage({ kind: 'ok', text: 'Backup téléchargé. Garde-le dans un endroit sûr.' });
  }

  async function onImport(file: File) {
    if (!confirm('Importer ce backup va REMPLACER toutes les données actuelles. On continue?')) return;
    const { importBackup } = await import('@/data/backup');
    const result = await importBackup(db, await file.text());
    setMessage(
      result.ok
        ? { kind: 'ok', text: `Import réussi : ${result.counts.activities} activités, ${result.counts.races} courses.` }
        : { kind: 'error', text: result.error },
    );
  }

  async function onClearDemo() {
    if (!confirm('Effacer toutes les données de démo? Tes vraies données ne sont pas touchées.')) return;
    await clearDemo(db);
    setMessage({ kind: 'ok', text: 'Démo effacée.' });
  }

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold">Plus</h1>

      <Card className="space-y-2">
        <Eyebrow>Raccourcis</Eyebrow>
        <Link to="/profil" className="block rounded-xl bg-surface-2 p-3 hover:bg-line">Profil : zones, FC max, dispos, calibration</Link>
        <Link to="/muscu" className="block rounded-xl bg-surface-2 p-3 hover:bg-line">Séance de muscu libre</Link>
        <Link to="/sante" className="block rounded-xl bg-surface-2 p-3 hover:bg-line">Questionnaire santé</Link>
        <Link to="/importer" className="block rounded-xl bg-surface-2 p-3 hover:bg-line">Importer des activités Garmin (FIT, GPX, TCX, CSV)</Link>
        <Link to="/objectif" className="block rounded-xl bg-surface-2 p-3 hover:bg-line">Nouvel objectif</Link>
      </Card>

      <Card>
        <Eyebrow>Apparence</Eyebrow>
        <div role="radiogroup" aria-label="Thème" className="mt-3 grid grid-cols-3 gap-2">
          {(
            [
              ['dark', 'Sombre'],
              ['light', 'Clair'],
              ['system', 'Système'],
            ] as [ThemePref, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              role="radio"
              aria-checked={pref === value}
              onClick={() => setPref(value)}
              className={cn('h-11 rounded-full border text-sm transition', pref === value ? 'border-accent bg-accent/15 text-text' : 'border-line text-muted hover:text-text')}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      {cloudConfigured && (
        <>
          <Suspense fallback={null}>
            <Account />
          </Suspense>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/communaute" className="rounded-2xl border border-line p-4 transition hover:bg-surface-2">
              <span className="block font-medium">Communauté</span>
              <span className="text-sm text-muted">Amis et courses partagées</span>
            </Link>
            <Link to="/coach" className="rounded-2xl border border-line p-4 transition hover:bg-surface-2">
              <span className="block font-medium">Coach</span>
              <span className="text-sm text-muted">Mon coach, mes athlètes</span>
            </Link>
          </div>
        </>
      )}

      <Card className="space-y-3">
        <Eyebrow>Tes données</Eyebrow>
        <p className="text-sm text-muted">{cloudConfigured ? t.privacyCloud : t.privacy}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onExport}>Exporter un backup</Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Importer un backup
          </Button>
          <Button variant="ghost" onClick={async () => setMessage((await requestPersistence()) ? { kind: 'ok', text: 'Stockage persistant activé.' } : { kind: 'error', text: 'Le navigateur a refusé le stockage persistant. Fais des backups réguliers.' })}>
            Protéger mes données
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = '';
            }}
          />
        </div>
        {isDemo && (
          <Button variant="danger" size="sm" onClick={onClearDemo}>
            Effacer les données de démo
          </Button>
        )}
        {message && (
          <p role="status" className={cn('text-sm', message.kind === 'ok' ? 'text-ok' : 'text-danger')}>
            {message.text}
          </p>
        )}
      </Card>

      <Card>
        <Eyebrow>À propos</Eyebrow>
        <p className="mt-2 text-sm text-muted">{t.disclaimer}</p>
        <Link to="/design" className="mt-3 inline-block text-sm underline underline-offset-4">
          Design system
        </Link>
      </Card>
    </div>
  );
}
