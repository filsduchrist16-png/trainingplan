import { Button } from '@/ui/components/Button';
import { Card, Eyebrow } from '@/ui/components/Card';
import { ElevationProfile } from '@/ui/components/ElevationProfile';
import { EmptyState } from '@/ui/components/EmptyState';
import { Ring } from '@/ui/components/Ring';
import { Why } from '@/ui/components/Why';

const swatches = ['bg', 'surface', 'surface-2', 'line', 'text', 'text-muted', 'accent', 'ok', 'warn', 'danger'];
const zones = ['z1', 'z2', 'z3', 'z4', 'z5'];
const demoProfile: [number, number][] = Array.from({ length: 60 }, (_, i) => [i, 300 + 150 * Math.sin(i / 6) + 60 * Math.sin(i / 2)]);

/** Page de référence du design system (accessible depuis Réglages). */
export function DesignSystem() {
  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-semibold">Design system</h1>
      <Card>
        <Eyebrow>Couleurs</Eyebrow>
        <div className="mt-3 grid grid-cols-5 gap-2">
          {swatches.map((s) => (
            <div key={s} className="text-center text-[10px] text-muted">
              <div className="mb-1 h-12 rounded-lg border border-line" style={{ background: `var(--${s})` }} />
              {s}
            </div>
          ))}
        </div>
        <div className="mt-4 flex h-3 overflow-hidden rounded-full">
          {zones.map((z) => (
            <div key={z} className="flex-1" style={{ background: `var(--${z})` }} title={z} />
          ))}
        </div>
      </Card>
      <Card className="space-y-2">
        <Eyebrow>Typo</Eyebrow>
        <h2 className="text-3xl">Fraunces pour les titres</h2>
        <p>Inter pour le texte. Les chiffres sont tabulaires :</p>
        <p className="num text-2xl">5:42 /km · 143 bpm · 1 500 m D+</p>
      </Card>
      <Card className="flex flex-wrap gap-2">
        <Button>Principal</Button>
        <Button variant="secondary">Secondaire</Button>
        <Button variant="ghost">Discret</Button>
        <Button variant="danger">Danger</Button>
      </Card>
      <Card>
        <Eyebrow>Profil</Eyebrow>
        <ElevationProfile points={demoProfile} className="mt-3 h-24 w-full" />
        <div className="mt-4 flex justify-around">
          <Ring value={32} max={45} label="Volume" display="32 km" />
          <Ring value={900} max={1200} label="D+" display="900" color="var(--z3)" />
          <Ring value={2} max={2} label="Clés" display="2/2" color="var(--ok)" />
        </div>
        <Why className="mt-3">Exemple de justification dépliable.</Why>
      </Card>
      <EmptyState title="État vide">Un état vide soigné, jamais une page blanche.</EmptyState>
    </div>
  );
}
