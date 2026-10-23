import { BODY_MAP_LEVELS, PREVENTION_PAIN_LOOKBACK_DAYS } from './constants';
import { diffDays, mondayOf } from './dates';
import { explain } from './explain';
import type { BodyZone, Explanation, ISODate, InjuryRecord } from './types';

/**
 * Prévention : routines de renforcement à cocher (mollets 2×/sem, fessiers, routines ciblées selon tes douleurs)
 * et carte corporelle des douleurs récentes. Repères courants, À VALIDER par un physio ; une douleur persistante se consulte.
 */

export interface Routine {
  id: string;
  title: string;
  /** Séances par semaine visées. */
  perWeek: number;
  minutes: number;
  steps: string[];
  why: string;
}

export const ROUTINES: Record<string, Routine> = {
  mollets: { id: 'mollets', title: 'Mollets et soléaire', perWeek: 2, minutes: 10, steps: ['Mollets debout sur une jambe : 3 × 10-15, descente en 3 s', 'Mollets genoux fléchis (soléaire) : 3 × 12, lent', 'Marche sur la pointe des pieds : 2 × 20 pas'], why: 'Des mollets forts absorbent l’impact : moins de stress sur le tibia et le tendon d’Achille.' },
  hanches: { id: 'hanches', title: 'Fessiers et hanches', perWeek: 2, minutes: 10, steps: ['Pont fessier : 3 × 12', 'Pas latéral avec élastique : 2 × 15 de chaque côté', 'Planche latérale : 2 × 20-30 s de chaque côté'], why: 'Un bassin stable évite que le genou rentre à chaque foulée (bandelette, genou).' },
  chevilles: { id: 'chevilles', title: 'Mobilité des chevilles', perWeek: 3, minutes: 5, steps: ['Genou vers le mur, talon au sol : 2 × 10 de chaque côté', 'Cercles de cheville : 10 dans chaque sens'], why: 'Une cheville souple se plie avant que le genou ou l’Achille compense.' },
  tibias: { id: 'tibias', title: 'Tibias : tibial antérieur', perWeek: 3, minutes: 8, steps: ['Pointes de pieds relevées, talons au sol : 3 × 15', 'Marche sur les talons : 2 × 20 pas', 'Étirement doux du mollet : 2 × 30 s'], why: 'Renforcer le tibial antérieur partage la charge avec le périoste : base du retour d’une douleur au tibia.' },
  achille: { id: 'achille', title: 'Achille : excentriques', perWeek: 3, minutes: 10, steps: ['Descentes de talon sur une marche : 3 × 15, remonte avec les deux pieds, redescend sur un pied en 3 s', 'Même chose genou fléchi : 3 × 15'], why: 'Les excentriques lents sont la base de la rééducation du tendon d’Achille.' },
  genou: { id: 'genou', title: 'Genou : quadriceps et fessiers', perWeek: 3, minutes: 10, steps: ['Montée de banc : 3 × 10 de chaque côté', 'Squat sur chaise, lent : 3 × 10', 'Fente arrière : 2 × 8 de chaque côté'], why: 'Quadriceps et fessiers forts allègent le genou, surtout en descente.' },
  itb: { id: 'itb', title: 'Bandelette : abducteurs', perWeek: 3, minutes: 8, steps: ['Élévation latérale de jambe : 3 × 15', 'Pas latéral avec élastique : 3 × 12 de chaque côté', 'Relâchement du fascia lata au rouleau : 1 min'], why: 'Des abducteurs de hanche forts gardent le genou dans l’axe.' },
  pied: { id: 'pied', title: 'Pied : petit pied et voûte', perWeek: 3, minutes: 6, steps: ['Petit pied (« short foot ») : 3 × 10 de 5 s', 'Ramasser une serviette avec les orteils : 2 × 1 min', 'Marcher pieds nus sur surface douce'], why: 'La voûte plantaire est un ressort : plus elle est forte, moins la fascia est surchargée.' },
  dos: { id: 'dos', title: 'Dos : gainage', perWeek: 3, minutes: 8, steps: ['Bird-dog : 3 × 8 de chaque côté', 'Planche : 3 × 20-30 s', 'Pont fessier : 2 × 12'], why: 'Un tronc stable limite les compensations du bas du dos en fin de séance longue.' },
};

/** Routine ciblée de chaque zone du corps. */
export const ROUTINE_FOR_ZONE: Record<BodyZone, string> = {
  tibia_g: 'tibias', tibia_d: 'tibias', soleaire_g: 'mollets', soleaire_d: 'mollets', achille_g: 'achille', achille_d: 'achille',
  itb_g: 'itb', itb_d: 'itb', genou_g: 'genou', genou_d: 'genou', hanche_g: 'hanches', hanche_d: 'hanches', pied_g: 'pied', pied_d: 'pied', dos: 'dos', autre: 'hanches',
};

export interface PreventionItem {
  routine: Routine;
  done: number;
  remaining: number;
  /** Ciblée par une douleur ou une blessure récente (sinon : routine de base). */
  targeted: boolean;
  advice: Explanation;
}

interface PainPoint {
  zone: BodyZone;
  intensity: number;
  date: ISODate;
}

/** Plan de la semaine : routines de base (mollets, hanches, chevilles) + routines ciblées par les douleurs et blessures récentes. */
export function preventionPlan(checks: { date: ISODate; routine: string }[], today: ISODate, pains: PainPoint[], injuries: Pick<InjuryRecord, 'zone' | 'status'>[] = []): PreventionItem[] {
  const week = mondayOf(today);
  const targeted = new Set<string>();
  for (const p of pains) if (p.intensity > 0 && diffDays(p.date, today) >= 0 && diffDays(p.date, today) <= PREVENTION_PAIN_LOOKBACK_DAYS) targeted.add(ROUTINE_FOR_ZONE[p.zone]);
  for (const i of injuries) if (i.status !== 'resolue') targeted.add(ROUTINE_FOR_ZONE[i.zone]);
  const ids = [...new Set(['mollets', 'hanches', 'chevilles', ...targeted])];
  return ids.map((id) => {
    const routine = ROUTINES[id]!;
    const done = new Set(checks.filter((c) => c.routine === id && mondayOf(c.date) === week).map((c) => c.date)).size;
    const remaining = Math.max(0, routine.perWeek - done);
    const isTargeted = targeted.has(id);
    const advice = remaining === 0
      ? explain('prevention.done', 'info', `${routine.title} : fait cette semaine`, `${done} fois sur ${routine.perWeek}. ${routine.why}`, { fait: done })
      : explain(isTargeted ? 'prevention.targeted' : 'prevention.due', 'conseil', `${routine.title} : encore ${remaining} fois cette semaine`, `${routine.minutes} min, ${routine.perWeek}×/semaine. ${isTargeted ? `Recommandée à cause d'une douleur ou d'une blessure récente. ` : ''}${routine.why}`, { reste: remaining, minutes: routine.minutes });
    return { routine, done, remaining, targeted: isTargeted, advice };
  });
}

// ─── Carte corporelle ─────────────────────────────────────────────────────────

export interface BodyMapZone {
  zone: BodyZone;
  /** 0 = rien à signaler, 1 = gêne, 2 = douleur, 3 = forte. */
  level: 0 | 1 | 2 | 3;
  max: number;
  count: number;
  last?: ISODate;
}

/** Niveau de chaque zone du corps selon les douleurs déclarées les 28 derniers jours (la plus forte compte). */
export function bodyMap(pains: PainPoint[], today: ISODate): BodyMapZone[] {
  const zones = Object.keys(ROUTINE_FOR_ZONE).filter((z) => z !== 'autre') as BodyZone[];
  return zones.map((zone) => {
    const mine = pains.filter((p) => p.zone === zone && p.intensity > 0 && diffDays(p.date, today) >= 0 && diffDays(p.date, today) <= PREVENTION_PAIN_LOOKBACK_DAYS);
    const max = Math.max(0, ...mine.map((p) => p.intensity));
    const level = BODY_MAP_LEVELS.find(([from]) => max >= from)?.[1] ?? 0;
    return { zone, level, max, count: mine.length, ...(mine.length ? { last: mine.map((p) => p.date).sort().at(-1)! } : {}) };
  });
}
