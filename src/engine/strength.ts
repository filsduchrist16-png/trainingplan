import { STRENGTH_LOAD_STEP_KG, STRENGTH_NOVICE_MAX_SETS, STRENGTH_PROGRESS_MAX_RPE, STRENGTH_REST_SEC } from './constants';
import { explain } from './explain';
import type { Experience, Explanation, Phase } from './types';

/**
 * Muscu : catalogue d'exercices, programme par phase et double progression (reps d'abord, charge ensuite).
 * Pur : l'UI affiche ce que le moteur décide, la couche data garde les séries faites.
 */

export type StrengthKind = 'muscu_generale' | 'muscu_trail' | 'plyo';

export interface ExerciseInfo {
  id: string;
  name: string;
  category: 'force' | 'unilateral' | 'mollets' | 'gainage' | 'plyo';
  unilateral: boolean;
  /** Avec charge (kg) ; sinon poids du corps. */
  loaded: boolean;
  cues: string[];
}

export const EXERCISES: Record<string, ExerciseInfo> = {
  goblet: { id: 'goblet', name: 'Squat gobelet', category: 'force', unilateral: false, loaded: true, cues: ['Haltère contre la poitrine', 'Genoux dans l’axe des pieds', 'Descends en contrôle, pousse le sol'] },
  rdl: { id: 'rdl', name: 'Soulevé de terre roumain', category: 'force', unilateral: false, loaded: true, cues: ['Dos neutre, hanches vers l’arrière', 'Les haltères glissent le long des jambes', 'Sens l’arrière des cuisses étirer'] },
  bridge: { id: 'bridge', name: 'Pont fessier', category: 'force', unilateral: false, loaded: true, cues: ['Pousse dans les talons', 'Bassin neutre en haut, ne cambre pas', 'Serre les fessiers 1 s en haut'] },
  split: { id: 'split', name: 'Squat bulgare', category: 'unilateral', unilateral: true, loaded: true, cues: ['Pied arrière sur un banc', 'Buste droit, genou avant stable', 'Même nombre de reps de chaque côté'] },
  stepup: { id: 'stepup', name: 'Montée de banc', category: 'unilateral', unilateral: true, loaded: true, cues: ['Banc à hauteur du genou', 'Monte sans élan avec la jambe de travail', 'Redescends lentement'] },
  stepdown: { id: 'stepdown', name: 'Descente de banc (excentrique)', category: 'unilateral', unilateral: true, loaded: false, cues: ['Descends en 4 s sur une jambe', 'Genou dans l’axe, bassin stable', 'Prépare les descentes de trail'] },
  lunge: { id: 'lunge', name: 'Fentes marchées', category: 'unilateral', unilateral: true, loaded: true, cues: ['Grands pas, genou avant au-dessus du pied', 'Tronc droit', 'Contrôle chaque descente'] },
  calf: { id: 'calf', name: 'Mollets debout (unilatéral)', category: 'mollets', unilateral: true, loaded: true, cues: ['Monte en 1 s, tiens 1 s en haut, descends en 3 s', 'Amplitude complète, talon sous la marche', 'Tendon d’Achille en santé : mollets 2×/sem'] },
  soleus: { id: 'soleus', name: 'Mollets assis (soléaire)', category: 'mollets', unilateral: false, loaded: true, cues: ['Genoux fléchis à 90°', 'Lent et contrôlé', 'Cible le soléaire, clé du tibia et du tendon'] },
  plank: { id: 'plank', name: 'Planche', category: 'gainage', unilateral: false, loaded: false, cues: ['Corps aligné, ne cambre pas', 'Respire normalement', 'Mesure le temps tenu (reps = secondes ÷ 10)'] },
  sideplank: { id: 'sideplank', name: 'Planche latérale', category: 'gainage', unilateral: true, loaded: false, cues: ['Hanche haute, coudes sous l’épaule', 'Corps en ligne', 'Mesure le temps tenu (reps = secondes ÷ 10)'] },
  birddog: { id: 'birddog', name: 'Bird-dog', category: 'gainage', unilateral: true, loaded: false, cues: ['Bras et jambe opposés', 'Bassin immobile', 'Pause 2 s en extension'] },
  balance: { id: 'balance', name: 'Équilibre sur une jambe', category: 'gainage', unilateral: true, loaded: false, cues: ['Près d’un appui', 'Yeux ouverts puis fermés', 'Tiens 30 s de chaque côté (reps = secondes ÷ 10)'] },
  pogo: { id: 'pogo', name: 'Pogos (petits sauts)', category: 'plyo', unilateral: false, loaded: false, cues: ['Chevilles rigides, contact bref', 'Reste léger, silencieux', 'Cadence rapide'] },
  squatjump: { id: 'squatjump', name: 'Squats sautés', category: 'plyo', unilateral: false, loaded: false, cues: ['Saute vite, atterris doucement', 'Genoux dans l’axe', 'Récupération complète entre les séries'] },
  bound: { id: 'bound', name: 'Bonds alternés', category: 'plyo', unilateral: true, loaded: false, cues: ['Grandes foulées bondissantes', 'Temps de vol, pas de vitesse', 'Atterris sur l’avant-pied'] },
};

export interface ProgramRow {
  exerciseId: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  /** Tempo excentrique-pause-concentrique en secondes (« 3-1-1 »), guidé à l'écran. */
  tempo?: string;
  restSec: number;
  note?: string;
}

export interface StrengthProgram {
  name: string;
  scheme: 'fondation' | 'force' | 'maintien';
  rows: ProgramRow[];
  /** RPE visé des séries de travail. */
  rpeTarget: number;
  explanation: Explanation;
}

export interface ProgramInput {
  type: StrengthKind;
  phase: Phase;
  experience: Experience;
  trail?: boolean;
  /** 65 ans et plus : de l'équilibre dans la séance. */
  balance?: boolean;
  /** Grossesse : pas de pliométrie, charges modérées, pas de gainage au sol prolongé. */
  pregnancy?: boolean;
}

const SCHEME: Record<Phase, StrengthProgram['scheme']> = {
  demarrage: 'fondation', base: 'fondation', maintien: 'fondation', recup: 'fondation',
  spec1: 'force', spec2: 'force', precomp: 'maintien', taper: 'maintien',
};

const row = (exerciseId: string, sets: number, repsMin: number, repsMax: number, restSec: number, tempo?: string, note?: string): ProgramRow => ({ exerciseId, sets, repsMin, repsMax, restSec, ...(tempo ? { tempo } : {}), ...(note ? { note } : {}) });

/** Programme d'une séance de muscu selon le type, la phase et le niveau. */
export function strengthProgram(input: ProgramInput): StrengthProgram {
  const novice = input.experience === 'jamais' || input.experience === 'debutant';
  if (input.type === 'plyo') {
    if (input.pregnancy || novice) {
      return { name: 'Pliométrie : reportée', scheme: 'maintien', rows: [], rpeTarget: 0, explanation: explain('strength.plyo.skip', 'conseil', 'Pas de pliométrie pour l’instant', input.pregnancy ? 'Pas de sauts pendant la grossesse : on garde le renforcement.' : 'Les sauts viennent après quelques mois de base : d’abord force et technique.') };
    }
    return {
      name: 'Pliométrie', scheme: 'maintien', rpeTarget: 7,
      rows: [row('pogo', 3, 10, 15, 60), row('squatjump', 3, 5, 8, 90, undefined, 'Atterris doucement'), row('bound', 3, 6, 10, 90)],
      explanation: explain('strength.plyo', 'info', 'Pliométrie : vitesse, pas fatigue', 'Peu de reps, repos complets : on cherche la réactivité du tendon, pas l’épuisement. Arrête dès que tu ralentis.'),
    };
  }
  const scheme = SCHEME[input.phase];
  const maxSets = novice ? STRENGTH_NOVICE_MAX_SETS : 4;
  const sets = (n: number) => Math.min(n, maxSets);
  const rest = STRENGTH_REST_SEC[scheme];
  const [lo, hi] = scheme === 'force' && !novice ? [5, 8] : scheme === 'maintien' ? [5, 8] : [8, 12];
  const tempo = '3-1-1';
  const rows: ProgramRow[] = [
    row('goblet', sets(scheme === 'maintien' ? 2 : 3), lo, hi, rest, tempo),
    row('rdl', sets(scheme === 'maintien' ? 2 : 3), lo, hi, rest, tempo),
    row('split', sets(scheme === 'maintien' ? 2 : 3), lo, hi, rest, tempo, 'Même nombre de reps de chaque côté'),
    row('calf', sets(3), scheme === 'force' ? 6 : 10, scheme === 'force' ? 10 : 15, 60, '3-1-1', 'Mollets 2×/sem : tibia et Achille te disent merci'),
    row('plank', 2, 3, 6, 45, undefined, 'Reps = secondes ÷ 10'),
  ];
  if (input.trail) rows.splice(3, 0, row('stepdown', sets(3), 8, 12, rest, '4-1-1', 'Prépare les descentes de course'));
  if (input.balance) rows.push(row('balance', 2, 3, 3, 30, undefined, '30 s de chaque côté'));
  if (input.pregnancy) {
    const i = rows.findIndex((r) => r.exerciseId === 'plank');
    rows.splice(i, 1, row('birddog', 2, 8, 12, 45, undefined, 'Au sol à quatre pattes : pas de gainage sur le ventre'));
  }
  const rpeTarget = scheme === 'force' ? 8 : scheme === 'maintien' ? 6 : 7;
  const why = {
    fondation: 'Phase de fondation : reps plus nombreuses (8-12), tempo lent et technique. On prépare les tissus avant de charger lourd.',
    force: 'Phase de force : charges plus lourdes (5-8 reps), repos longs. La force économise l’énergie de chaque foulée.',
    maintien: 'Phase de maintien : on garde la force acquise avec peu de séries, sans fatigue qui nuit à la course.',
  }[scheme];
  return { name: input.type === 'muscu_trail' ? 'Muscu trail' : 'Muscu générale', scheme, rows, rpeTarget, explanation: explain(`strength.${scheme}`, 'info', `Programme : ${scheme}`, `${why}${novice ? ' Au plus 3 séries tant que tu débutes.' : ''}`, { rpe: rpeTarget }) };
}

export interface SetResult {
  reps: number;
  loadKg?: number;
  rpe?: number;
}

export interface NextTarget {
  reps: number;
  loadKg?: number;
  explanation: Explanation;
}

/**
 * Double progression : on monte les reps jusqu'au haut de la fourchette, PUIS la charge.
 * - toutes les séries au haut de la fourchette à RPE ≤ 8 → charge +2,5 kg (ou « ajoute une charge » au poids du corps), reps au bas ;
 * - une série sous le bas de la fourchette → même charge, on revient au bas ;
 * - sinon → même charge, +1 rep sur la série la plus faible ;
 * - RPE ≥ 9 : on ne monte pas, même si les reps sont là.
 */
export function nextTarget(history: SetResult[], range: { repsMin: number; repsMax: number }, opts: { loaded?: boolean } = {}): NextTarget {
  if (!history.length) {
    return { reps: range.repsMin, explanation: explain('strength.first', 'info', 'Première fois', `Commence léger : ${range.repsMin} reps propres, RPE 6. On ajuste la charge à la séance suivante.`, { reps: range.repsMin }) };
  }
  const load = history.map((s) => s.loadKg).filter((x): x is number => x !== undefined);
  const loadKg = load.length ? Math.max(...load) : undefined;
  const reps = Math.min(...history.map((s) => s.reps));
  const rpes = history.flatMap((s) => (s.rpe === undefined ? [] : [s.rpe]));
  const hard = rpes.some((r) => r > STRENGTH_PROGRESS_MAX_RPE);
  const keep = (loadKg === undefined ? {} : { loadKg });
  if (reps >= range.repsMax && !hard) {
    if (loadKg !== undefined) return { reps: range.repsMin, loadKg: Math.round((loadKg + STRENGTH_LOAD_STEP_KG) * 10) / 10, explanation: explain('strength.load', 'info', 'On monte la charge', `Toutes tes séries à ${range.repsMax} reps, effort sous ${STRENGTH_PROGRESS_MAX_RPE + 1} : +${STRENGTH_LOAD_STEP_KG} kg et retour à ${range.repsMin} reps.`, { charge: loadKg + STRENGTH_LOAD_STEP_KG }) };
    return { reps: range.repsMax, explanation: explain('strength.addload', 'info', opts.loaded ? 'Ajoute une charge' : 'Fourchette atteinte', opts.loaded ? `Tu fais ${range.repsMax} reps au poids du corps sans forcer : prends un haltère léger et repars à ${range.repsMin} reps.` : `${range.repsMax} reps propres : tu peux ralentir le tempo ou passer à la variante plus difficile.`, { reps: range.repsMax }) };
  }
  if (hard && reps >= range.repsMax) return { reps: range.repsMax, ...keep, explanation: explain('strength.hold', 'conseil', 'On garde la même charge', 'Les reps sont là, mais l’effort était à 9-10 : on consolide avant de monter.', { rpe: Math.max(...rpes) }) };
  if (reps < range.repsMin) return { reps: range.repsMin, ...keep, explanation: explain('strength.back', 'conseil', 'Retour au bas de la fourchette', `Une série sous ${range.repsMin} reps : même charge, vise ${range.repsMin} reps propres partout.`, { reps }) };
  return { reps: Math.min(range.repsMax, reps + 1), ...keep, explanation: explain('strength.reps', 'info', '+1 rep', `Même charge, vise ${Math.min(range.repsMax, reps + 1)} reps sur chaque série. Quand toutes les séries seront à ${range.repsMax}, on monte la charge.`, { reps: reps + 1 }) };
}

/** Tempo « 3-1-1 » → étapes guidées (secondes) : descente, pause, montée. */
export function tempoSteps(tempo: string): { label: 'Descends' | 'Pause' | 'Monte'; sec: number }[] {
  const [down = 3, pause = 1, up = 1] = tempo.split('-').map(Number);
  return [{ label: 'Descends', sec: down }, { label: 'Pause', sec: pause }, { label: 'Monte', sec: up }];
}
