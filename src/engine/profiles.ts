import {
  PROFILE_BMI_SLOW, PROFILE_BUILD_WEEKS_BEFORE_DELOAD, PROFILE_DIABETES_NOTE_MIN, PROFILE_MASTERS_AGE, PROFILE_MASTERS_MAX_KEY_NOVICE,
  POSTPARTUM_NO_RUN_DAYS, PROFILE_MINOR_AGE, PROFILE_RECENT_INJURY_DAYS, PROFILE_RUNWALK_MIN_CAPACITY, PROFILE_SENIOR_AGE, PROFILE_SLOW_AGE,
} from './constants';
import { diffDays } from './dates';
import { explain } from './explain';
import type { Difficulty, Experience, Explanation, GoalKind, HealthProfile, ISODate, InjuryRecord, SessionType } from './types';

/**
 * Profils : ajustements dérivés de l'âge, de l'IMC, du questionnaire santé et des blessures.
 * Ils RESTREIGNENT le plan, jamais l'inverse. Seuils À VALIDER (constants.ts).
 */
export interface ProfileInput {
  experience: Experience;
  birthYear?: number;
  heightCm?: number;
  weightKg?: number;
  health?: HealthProfile;
  injuries?: InjuryRecord[];
  today: ISODate;
}

/** Note ajoutée aux séances concernées (diabète, asthme, surfaces souples, équilibre…). */
export interface SessionNote {
  ruleId: string;
  text: string;
  /** Séances d'au moins cette durée seulement. */
  minMinutes?: number;
  /** Séances de course seulement (sinon : muscu seulement si `strength`). */
  appliesTo: 'course' | 'muscu';
}

export interface ProfileAdjustments {
  /** 3 séances validées par palier au lieu de 2. */
  slow: boolean;
  /** Niveau 0 : marche d'abord (ne marche pas 30 min). */
  walkFirst: boolean;
  /** Semaines de charge avant une décharge (3 normalement, 2 en profil lent ou 50+). */
  buildWeeksBeforeDeload?: number;
  maxKeySessions?: number;
  /** Zones à l'effort perçu, pas de test FCmax, debrief FC désactivé. */
  hrUnreliable: boolean;
  noVo2: boolean;
  noConsecutiveDays: boolean;
  /** Marche/course si la capacité continue est sous ce seuil (min). */
  runWalkMinCapacity?: number;
  /** Expérience retenue (rétrogradée d'un niveau après une blessure récente). */
  experience: Experience;
  /** Blessure active : pas de plan de course, croisé seulement. */
  injuryActive: boolean;
  maxDifficulty?: Difficulty;
  forbiddenGoals: GoalKind[];
  /** Seuls ces objectifs sont permis (grossesse : « garder la forme »). */
  allowedGoals?: GoalKind[];
  /** Marche seulement (grossesse sans course avant, post-partum avant le feu vert) : échelle plafonnée au palier 0. */
  walkOnly: boolean;
  /** Tout le plan sous Z2 (grossesse : RPE ≤ 5-6). */
  easyOnly: boolean;
  /** Reprise en marche/course à ce palier au plus, quelle que soit l'expérience (post-partum). */
  forceStage?: number;
  sessionNotes: SessionNote[];
  explanations: Explanation[];
}

const DOWNGRADE: Record<Experience, Experience> = { jamais: 'jamais', debutant: 'jamais', regulier: 'debutant', avance: 'regulier' };
const novice = (e: Experience) => e === 'jamais' || e === 'debutant';

export function bmi(heightCm?: number, weightKg?: number): number | undefined {
  if (!heightCm || !weightKg) return undefined;
  return Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10;
}

export function deriveProfile(input: ProfileInput): ProfileAdjustments {
  const h = input.health;
  const a = h?.answers;
  const age = input.birthYear ? Number(input.today.slice(0, 4)) - input.birthYear : undefined;
  const imc = bmi(input.heightCm, input.weightKg);
  const injuries = (input.injuries ?? []).filter((i) => i.status !== 'resolue');
  const injuryActive = injuries.some((i) => i.status === 'active');
  const recentInjury = injuries.some((i) => i.since !== undefined && diffDays(i.since, input.today) < PROFILE_RECENT_INJURY_DAYS);
  const injuryReturn = Boolean(a?.q6) || injuries.length > 0;
  const walkFirst = a?.q9 === false;
  const out: ProfileAdjustments = {
    slow: false, walkFirst, hrUnreliable: Boolean(a?.q5 && h?.hrUnreliable), noVo2: false, noConsecutiveDays: false,
    experience: input.experience, injuryActive, forbiddenGoals: [], walkOnly: false, easyOnly: false, sessionNotes: [], explanations: [],
  };
  const why: string[] = [];

  if (walkFirst) why.push('tu ne marches pas encore 30 min sans gêne');
  if (age !== undefined && age >= PROFILE_SLOW_AGE) why.push(`${age} ans`);
  if (imc !== undefined && imc >= PROFILE_BMI_SLOW) why.push(`IMC de ${imc}`);
  if (a?.q1 || a?.q4) why.push('ton questionnaire santé');
  if (injuryReturn) why.push('un retour de blessure');
  if (why.length) {
    out.slow = true;
    out.buildWeeksBeforeDeload = PROFILE_BUILD_WEEKS_BEFORE_DELOAD;
    out.explanations.push(explain('profile.slow', 'conseil', 'Progression plus lente', `Selon ton profil (${why.join(', ')}) : 3 séances réussies par palier au lieu de 2, et une semaine de décharge toutes les 3 semaines plutôt que toutes les 4. Os et tendons s'adaptent plus lentement que le cardio.`));
  }
  if (walkFirst) {
    out.explanations.push(explain('profile.walk_first', 'conseil', 'Marche d’abord', 'On commence par la marche rapide (20 → 30 min), puis la course arrive par petits intervalles.'));
  }
  if (age !== undefined && age >= PROFILE_MASTERS_AGE) {
    out.buildWeeksBeforeDeload = PROFILE_BUILD_WEEKS_BEFORE_DELOAD;
    if (novice(input.experience)) out.maxKeySessions = PROFILE_MASTERS_MAX_KEY_NOVICE;
    out.explanations.push(explain('profile.masters', 'conseil', `${age} ans : récupérer compte double`, `Décharge toutes les 3 semaines${novice(input.experience) ? ', au plus 1 séance clé par semaine' : ''}, et 2 séances de renforcement par semaine conseillées : la force se perd plus vite que l'endurance.`, { age }));
  }
  if (age !== undefined && age >= PROFILE_SENIOR_AGE) {
    out.runWalkMinCapacity = PROFILE_RUNWALK_MIN_CAPACITY;
    if (novice(input.experience)) out.noVo2 = true;
    out.sessionNotes.push({ ruleId: 'profile.balance', appliesTo: 'muscu', text: 'Ajoute de l’équilibre : tenir sur un pied 30 s de chaque côté, près d’un appui.' });
    out.explanations.push(explain('profile.senior', 'conseil', '65 ans et plus', `Marche/course si tu cours moins de ${PROFILE_RUNWALK_MIN_CAPACITY} min d'affilée, de l'équilibre dans le renforcement${novice(input.experience) ? ', et pas de VO2max sans 6 mois de base' : ''}.`, { age }));
  }
  if (imc !== undefined && imc >= PROFILE_BMI_SLOW) {
    out.noConsecutiveDays = true;
    out.sessionNotes.push({ ruleId: 'profile.surface', appliesTo: 'course', text: 'Privilégie les surfaces souples (sentier, gravier, piste) : moins d’impact à chaque pas.' });
    out.explanations.push(explain('profile.bmi', 'conseil', 'Ménager les articulations', 'Jamais deux jours de course de suite, des séances en minutes plutôt qu’en kilomètres, et des surfaces souples quand c’est possible.', { imc }));
  }
  if (out.hrUnreliable) {
    out.explanations.push(explain('profile.hr_unreliable', 'conseil', 'Zones à l’effort perçu', 'Ton médicament modifie ta fréquence cardiaque : tes zones se lisent au RPE et au test de la parole. Pas de FC max estimée ni de test de FC max ; le debrief ne juge pas ta FC.'));
  }
  if (h?.conditions.includes('diabete')) {
    out.sessionNotes.push({ ruleId: 'profile.diabetes', appliesTo: 'course', minMinutes: PROFILE_DIABETES_NOTE_MIN, text: 'Diabète : apporte du sucre rapide, et contrôle ta glycémie avant et après comme convenu avec ton médecin.' });
  }
  if (h?.conditions.includes('asthme')) {
    out.sessionNotes.push({ ruleId: 'profile.asthma', appliesTo: 'course', text: 'Asthme : inhalateur sur toi, et au moins 10 min d’échauffement très facile.' });
  }
  if (injuryActive) {
    out.explanations.push(explain('profile.injury.active', 'stop', 'Blessure active : pas de plan de course', 'Une blessure est encore active : on ne bâtit pas de plan de course dessus. Garde la forme en croisé (vélo, natation, elliptique) et suis la zone dans l’onglet Corps ; on planifie dès qu’elle est passée.'));
  } else if (recentInjury) {
    out.experience = DOWNGRADE[input.experience];
    out.runWalkMinCapacity = PROFILE_RUNWALK_MIN_CAPACITY;
    out.explanations.push(explain('profile.injury.recent', 'conseil', 'Retour de blessure récente', `Blessure de moins de ${PROFILE_RECENT_INJURY_DAYS / 7} semaines : on te planifie un niveau plus bas, et en marche/course si tu cours moins de ${PROFILE_RUNWALK_MIN_CAPACITY} min d'affilée.`));
  }
  if (age !== undefined && age < PROFILE_MINOR_AGE) {
    out.forbiddenGoals = ['route_marathon', 'trail_moyen', 'ultra'];
    out.maxDifficulty = 'equilibre';
    out.explanations.push(explain('profile.minor', 'conseil', 'Moins de 18 ans', 'Pas de marathon, de trail moyen ni d’ultra avant 18 ans : le squelette grandit encore. Difficulté au plus « équilibré ».', { age }));
  }
  const preg = a?.q8 ? h?.pregnancy : undefined;
  if (preg?.status === 'enceinte') {
    out.allowedGoals = ['forme'];
    out.easyOnly = true;
    out.walkOnly = input.experience === 'jamais';
    out.sessionNotes.push({ ruleId: 'profile.pregnancy.stop', appliesTo: 'course', text: 'Arrête et consulte si : saignement, perte de liquide, contractions, douleur au mollet, vertige, essoufflement avant l’effort, douleur à la poitrine.' });
    out.explanations.push(explain('profile.pregnancy', 'attention', 'Grossesse : garder la forme', `Pas d'objectif de course ni de volume qui monte : on garde la forme, au ressenti (RPE 5-6 au plus, tu peux parler)${out.walkOnly ? ', en marchant puisque tu ne courais pas avant' : ''}. Fais valider ton plan par ton suivi de grossesse.`));
  } else if (preg?.status === 'post_partum') {
    const days = diffDays(preg.dueOrBirthDate, input.today);
    const test = preg.returnTest;
    if (days < POSTPARTUM_NO_RUN_DAYS) {
      out.walkOnly = true;
      out.explanations.push(explain('profile.postpartum.early', 'attention', 'Post-partum : marche d’abord', `${Math.floor(days / 7)} semaines après l'accouchement : pas de course avant 3 mois, le temps que le plancher pelvien et les abdominaux récupèrent. On marche, et on refait le point à ${Math.round(POSTPARTUM_NO_RUN_DAYS / 7)} semaines avec le test de reprise.`, { semaines: Math.floor(days / 7) }));
    } else if (!test || !test.allDone || test.symptoms) {
      out.walkOnly = true;
      out.explanations.push(test?.symptoms
        ? explain('profile.postpartum.physio', 'attention', 'Symptôme au test de reprise : physio périnéale', 'Fuites, lourdeur ou douleur pendant le test : on reste à la marche, et on te conseille une physiothérapeute en rééducation périnéale avant de courir. Ce n’est pas un échec, c’est l’étape qui protège la suite.')
        : explain('profile.postpartum.test', 'conseil', 'Test de reprise avant de courir', 'Avant la 1re course : marche 30 min, équilibre sur une jambe 10 s, 10 squats sur une jambe, 1 min de jogging sur place, 10 sauts sur chaque jambe… sans fuite, lourdeur ni douleur. En attendant, on marche.'));
    } else {
      out.forceStage = 1;
      out.explanations.push(explain('profile.postpartum.ready', 'info', 'Reprise post-partum : marche/course', 'Test de reprise réussi sans symptôme : on reprend en marche/course au palier 1, quelle que soit ton expérience d’avant. Ton corps a changé, la progression se fait séance par séance.'));
    }
  }
  return out;
}

/** Test de reprise post-partum (Goom, Donnelly et Brockwell, 2019) : tout doit se faire sans symptôme. */
export const POSTPARTUM_RETURN_TEST: string[] = [
  'Marcher 30 min',
  'Tenir sur une jambe 10 s, de chaque côté',
  '10 squats sur une jambe, de chaque côté',
  '1 min de jogging sur place',
  '10 bonds vers l’avant',
  '10 sauts sur place sur chaque jambe',
  '10 « running man » sur une jambe (genou opposé monté, bras opposé), de chaque côté',
];
export const POSTPARTUM_SYMPTOMS: string[] = ['Fuites urinaires', 'Lourdeur ou pression pelvienne', 'Douleur (bassin, ventre, cicatrice)'];

/** Notes de profil qui s'appliquent à une séance. */
export function notesFor(notes: SessionNote[], session: { type: SessionType; durationMin: number }, isRun: boolean): string[] {
  const strength = session.type.startsWith('muscu');
  return notes.filter((n) => (n.appliesTo === 'course' ? isRun : strength) && session.durationMin >= (n.minMinutes ?? 0)).map((n) => n.text);
}
