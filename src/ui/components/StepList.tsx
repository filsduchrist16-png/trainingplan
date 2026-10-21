import { ZONE_FEEL, formatPace, paceForTarget, zoneTarget, type Athlete, type Step } from '@/engine';

const KIND: Record<Step['kind'], string> = { echauffement: 'Échauffement', effort: 'Effort', recup: 'Récup', retour_calme: 'Retour au calme', continu: 'Continu' };

/** Structure d'une séance : chaque bloc avec la cible en bpm, en ressenti et en allure indicative. */
export function StepList({ steps, athlete, trail }: { steps: Step[]; athlete: Athlete; trail: boolean }) {
  if (!steps.length) return null;
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => {
        const dur = s.distanceKm ? `${s.distanceKm} km` : s.minutes ? `${s.minutes} min` : `${s.seconds} s`;
        const target = s.target;
        let label: string;
        let feel: string;
        if ('zone' in target) {
          const z = zoneTarget(target.zone, { bounds: athlete.zones.bounds, hrMax: athlete.hrMax, hrUnreliable: athlete.health?.hrUnreliable });
          label = `${target.zone.toUpperCase()} · ${z.unit === 'RPE' ? `RPE ${z.value}` : `${z.value} bpm`}`;
          feel = z.feel;
        } else if ('pace' in target) {
          label = { E: 'Allure facile', M: 'Allure marathon', T: 'Allure seuil', I: 'Allure intervalles', R: 'Allure répétitions' }[target.pace];
          feel = { E: ZONE_FEEL.z2, M: 'Soutenu mais contrôlé.', T: '« Confortablement dur » : quelques mots.', I: 'Dur : tu tiens 3-5 min, pas plus.', R: 'Vite et relâché.' }[target.pace];
        } else {
          label = `Effort ${target.rpe}/10`;
          feel = target.rpe >= 9 ? 'À fond, mais court.' : 'Rapide et relâché.';
        }
        const pace = athlete.vdot || 'pace' in target ? formatPace(paceForTarget(target, { vdot: athlete.vdot, trail })) : null;
        return (
          <li key={i} className="rounded-xl bg-surface-2 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-medium">{KIND[s.kind]} <span className="num text-muted">{s.repeat && s.repeat > 1 ? `${s.repeat} × ` : ''}{dur}</span></p>
              {pace && <p className="num text-sm text-muted">~{pace} /km</p>}
            </div>
            <p className="mt-1 text-sm">{label}</p>
            <p className="text-sm text-muted">{s.note ?? feel}</p>
          </li>
        );
      })}
    </ol>
  );
}
