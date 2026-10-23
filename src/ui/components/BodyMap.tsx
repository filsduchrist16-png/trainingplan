import { zoneLabel, type BodyMapZone, type BodyZone } from '@/engine';

/** Position de chaque zone sur la silhouette vue de dos (gauche = côté gauche de la personne, à gauche de l'image). */
const POS: Record<Exclude<BodyZone, 'autre'>, [number, number]> = {
  dos: [100, 120], hanche_g: [76, 176], hanche_d: [124, 176], itb_g: [68, 222], itb_d: [132, 222], genou_g: [80, 268], genou_d: [120, 268],
  tibia_g: [80, 312], tibia_d: [120, 312], soleaire_g: [79, 338], soleaire_d: [121, 338], achille_g: [82, 366], achille_d: [118, 366], pied_g: [78, 388], pied_d: [122, 388],
};
const LEVEL = ['var(--line)', 'var(--warn)', 'var(--z4)', 'var(--danger)'] as const;
const LEVEL_TEXT = ['rien à signaler', 'gêne', 'douleur', 'forte douleur'] as const;

/** Silhouette cliquable : les zones colorées montrent les douleurs des 28 derniers jours. Choisir une zone la sélectionne. */
export function BodyMap({ zones, selected, onSelect }: { zones: BodyMapZone[]; selected: BodyZone | null; onSelect: (z: BodyZone) => void }) {
  return (
    <svg viewBox="0 0 200 410" role="group" aria-label="Carte du corps, vue de dos" className="mx-auto h-72 w-auto">
      <g fill="var(--surface-2)" stroke="var(--line)" strokeWidth={2}>
        <circle cx={100} cy={34} r={20} />
        <rect x={64} y={60} width={72} height={130} rx={26} />
        <rect x={66} y={190} width={30} height={205} rx={14} />
        <rect x={104} y={190} width={30} height={205} rx={14} />
        <rect x={34} y={64} width={22} height={110} rx={11} />
        <rect x={144} y={64} width={22} height={110} rx={11} />
      </g>
      {zones.map((z) => {
        const [x, y] = POS[z.zone as Exclude<BodyZone, 'autre'>];
        const label = `${zoneLabel(z.zone)} : ${LEVEL_TEXT[z.level]}${z.count ? `, ${z.count} déclaration${z.count > 1 ? 's' : ''}` : ''}`;
        return (
          <g key={z.zone} role="button" tabIndex={0} aria-label={label} aria-pressed={selected === z.zone} className="cursor-pointer outline-none" onClick={() => onSelect(z.zone)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(z.zone); } }}>
            <circle cx={x} cy={y} r={z.level ? 11 : 9} fill={LEVEL[z.level]} opacity={z.level ? 0.9 : 0.5} stroke={selected === z.zone ? 'var(--accent)' : 'none'} strokeWidth={3} />
          </g>
        );
      })}
    </svg>
  );
}
