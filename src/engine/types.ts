/**
 * Types du domaine Sentier. Partagés par le moteur (/engine), le stockage (/data) et l'UI (/ui).
 * Conventions :
 *  - `ISODate` = jour calendaire local `YYYY-MM-DD` (une séance appartient à un jour, pas à un instant).
 *  - `ISODateTime` = horodatage ISO 8601 complet.
 *  - Distances en km, dénivelés en m, durées en minutes (séances) ou secondes (séries temporelles), FC en bpm.
 */

export type ISODate = string;
export type ISODateTime = string;
export type Id = string;

/** Champs communs à toutes les entités persistées. */
export interface Entity {
  id: Id;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Owned extends Entity {
  athleteId: Id;
}

// ─── Athlète ──────────────────────────────────────────────────────────────────

export type Sex = 'homme' | 'femme' | 'autre';
export type Experience = 'jamais' | 'debutant' | 'regulier' | 'avance';
export type ZoneKey = 'z1' | 'z2' | 'z3' | 'z4' | 'z5';
export type BodyZone =
  | 'tibia_g' | 'tibia_d'
  | 'soleaire_g' | 'soleaire_d'
  | 'achille_g' | 'achille_d'
  | 'itb_g' | 'itb_d'
  | 'genou_g' | 'genou_d'
  | 'hanche_g' | 'hanche_d'
  | 'pied_g' | 'pied_d'
  | 'dos'
  | 'autre';
export type CrossTraining = 'velo' | 'home_trainer' | 'natation' | 'elliptique' | 'marche';
export type LoadMethod = 'sentier' | 'garmin';
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // ISO : 1 = lundi

/** Bornes supérieures (bpm) de Z1 à Z4 ; Z5 va jusqu'à la FCmax. */
export type ZoneBounds = [number, number, number, number];

export interface InjuryRecord {
  zone: BodyZone;
  label: string; // ex. « périostite tibiale »
  since?: ISODate;
  status: 'active' | 'dormante' | 'resolue';
}

export interface Availability {
  runDaysPerWeek: number; // 2-7
  allowedDays: Weekday[];
  longRunDay: Weekday;
  maxWeekdayMinutes: number;
  maxWeekendMinutes: number;
  strengthPerWeek: 0 | 1 | 2;
}

/** État de l'échelle marche/course (parcours de démarrage). */
export interface RunWalkState {
  /** 0 = marche d'abord, 1-13 = paliers, 14-18 = transition 22 → 30 min, 19 = parcours terminé. */
  stage: number;
  /** Séances validées DE SUITE au palier courant. */
  validatedAtStage: number;
  /** Échecs de suite au palier courant. */
  failsAtStage: number;
  lastSessionDate?: ISODate;
}

/** Questions du questionnaire santé (inspiré du PAR-Q+ et du dépistage ACSM, reformulé). */
export type HealthQuestion = 'q1' | 'q2' | 'q3' | 'q4' | 'q5' | 'q6' | 'q7' | 'q8' | 'q9';
export type ChronicCondition = 'diabete' | 'asthme' | 'cardio' | 'renal' | 'autre';

export interface HealthProfile {
  /** Réponses oui/non. Q9 (« peux-tu marcher 30 min ? ») : `true` = oui, c'est la bonne réponse. */
  answers: Record<HealthQuestion, boolean>;
  answeredAt: ISODate;
  /** « Un médecin m'autorise » : date de l'autorisation (débloque Q2, Q3, Q7). */
  clearance?: ISODate;
  /** Q5 : médicament qui modifie la FC (bêtabloquant…) → zones au RPE. */
  hrUnreliable?: boolean;
  /** Q4 : maladies chroniques déclarées. */
  conditions: ChronicCondition[];
  /** Q8 : grossesse en cours (date prévue) ou post-partum (date d'accouchement). */
  pregnancy?: { status: 'enceinte' | 'post_partum'; dueOrBirthDate: ISODate };
}

export interface Athlete extends Entity {
  name: string;
  sex?: Sex;
  birthYear?: number;
  weightKg?: number;
  heightCm?: number;
  /** Questionnaire santé ; absent = jamais rempli. */
  health?: HealthProfile;
  experience: Experience;
  hrMax: number;
  hrMaxSource: 'estimee' | 'test';
  hrRest: number;
  zones: { mode: 'auto' | 'manuel'; bounds: ZoneBounds };
  vdot?: number; // niveau de forme (allures route)
  vdotSource?: 'course' | 'vma' | 'test' | 'historique';
  vo2maxHistory: { date: ISODate; value: number }[];
  cadenceTarget: [number, number];
  injuries: InjuryRecord[];
  painFreeBaselineKm?: number;
  availability: Availability;
  crossTraining: CrossTraining[];
  hasPoles: boolean;
  localVertical: 'plat' | 'vallonne' | 'montagneux';
  /** Où en est l'échelle marche/course, recalculé du journal après chaque séance notée. */
  runWalk?: { state: RunWalkState; last?: Explanation; updatedOn: ISODate };
  settings: {
    loadMethod: LoadMethod;
    theme: 'dark' | 'light' | 'system';
  };
}

// ─── Objectifs et courses ─────────────────────────────────────────────────────

export type GoalKind =
  | 'route_5k' | 'route_10k' | 'route_semi' | 'route_marathon'
  | 'trail_court' | 'trail_moyen' | 'ultra'
  | 'debuter' // courir de zéro
  | 'forme'; // garder la forme, sans course
export type RacePriority = 'A' | 'B' | 'C';
export type Terrain = 'route' | 'sentier' | 'technique' | 'mixte';

export interface Race extends Owned {
  name: string;
  date: ISODate;
  distanceKm: number;
  elevationGainM: number;
  terrain: Terrain;
  priority: RacePriority;
  intent: 'effort_test' | 'chrono' | 'finir';
  targetTimeMin?: number;
  location?: string;
  notes?: string;
  /** Profil simplifié : [km, altitude m]. */
  profile?: [number, number][];
  result?: { timeMin: number; notes?: string };
}

// ─── Périodisation ────────────────────────────────────────────────────────────

export type Phase = 'demarrage' | 'base' | 'spec1' | 'spec2' | 'precomp' | 'taper' | 'recup' | 'maintien';
export type WeekKind = 'build' | 'decharge' | 'taper' | 'maintien' | 'recup' | 'course';
export type Difficulty = 'prudent' | 'equilibre' | 'ambitieux';

export interface Block extends Owned {
  goal: GoalKind;
  raceId?: Id;
  name: string;
  startDate: ISODate; // lundi
  endDate: ISODate;
  status: 'actif' | 'archive' | 'brouillon';
  difficulty: Difficulty;
  startVolumeKm: number;
  peakVolumeKm: number;
  /** Avertissements du moteur à la génération (pic plafonné, délai court…). */
  warnings?: Explanation[];
  /** Paramètres de génération, pour régénérer les semaines futures (changement de date, de dispo…). */
  request?: unknown;
  /** État d'entrée du parcours de démarrage (point de départ du journal). */
  runWalkStart?: RunWalkState;
}

export interface Week extends Owned {
  blockId: Id;
  index: number; // 0-based
  startDate: ISODate; // lundi
  phase: Phase;
  kind: WeekKind;
  targetKm: number;
  targetElevationM: number;
  keySessions: number;
  longRunKm?: number;
  notes?: Explanation[];
  raceDate?: ISODate;
  bRaceDate?: ISODate;
  /** Semaine du parcours de démarrage : palier prévu de chaque séance. */
  runWalk?: { sessions: { stage: number; validatedAtStage: number }[] };
  /** Volume du démarrage en minutes. */
  targetMinutes?: number;
  /** Plus longue sortie déjà faite avant cette semaine (km) : en décharge et à l'affûtage, la longue peut remonter jusque-là. */
  longestRunKm?: number;
  manualOverride?: boolean;
}

// ─── Séances ──────────────────────────────────────────────────────────────────

export type SessionType =
  | 'repos'
  | 'z1_recup'
  | 'z2_endurance'
  | 'strides'
  | 'hill_sprints'
  | 'cotes_longues'
  | 'seuil'
  | 'vo2max'
  | 'tempo' // allure marathon/semi en route
  | 'descentes'
  | 'longue_facile'
  | 'longue_specifique'
  | 'back_to_back'
  | 'marche_course' // départ de zéro
  | 'test'
  | 'course' // jour de course
  | 'croise' // vélo, natation…
  | 'muscu_generale'
  | 'muscu_trail'
  | 'plyo';

export type Intensity = { zone: ZoneKey } | { pace: 'E' | 'M' | 'T' | 'I' | 'R' } | { rpe: number };

export interface Step {
  kind: 'echauffement' | 'effort' | 'recup' | 'retour_calme' | 'continu';
  minutes?: number;
  seconds?: number;
  distanceKm?: number;
  repeat?: number;
  /** Récupération entre répétitions (s) ; par défaut égale à l'effort. */
  recoverySeconds?: number;
  recoveryWalk?: boolean;
  target: Intensity;
  note?: string;
}

export type SessionStatus = 'prevue' | 'faite' | 'allegee' | 'remplacee' | 'sautee';

export interface Explanation {
  ruleId: string;
  title: string;
  why: string;
  severity: 'info' | 'conseil' | 'attention' | 'stop';
  values?: Record<string, number | string>;
}

export interface PlannedSession extends Owned {
  weekId: Id;
  date: ISODate;
  type: SessionType;
  title: string;
  durationMin: number;
  distanceKm?: number;
  elevationGainM?: number;
  steps: Step[];
  rpeTarget?: number;
  isKey: boolean;
  minimal?: { title: string; durationMin: number; steps: Step[] };
  why: string;
  status: SessionStatus;
  activityId?: Id;
  adjustments: Explanation[];
}

// ─── Réalisé ──────────────────────────────────────────────────────────────────

export type ActivitySource = 'fit' | 'gpx' | 'tcx' | 'csv' | 'manuel' | 'demo';
export type Sport = 'course' | 'trail' | 'velo' | 'natation' | 'marche' | 'muscu' | 'autre';

export interface ActivitySamples {
  /** Secondes depuis le départ, pas de 5 s. Les autres séries sont alignées sur `t`. */
  t: number[];
  hr?: (number | null)[];
  speed?: (number | null)[]; // m/s
  altitude?: (number | null)[];
  cadence?: (number | null)[]; // pas/min
  distance?: (number | null)[]; // m cumulés
}

export interface Activity extends Owned {
  source: ActivitySource;
  fingerprint: string;
  sport: Sport;
  startTime: ISODateTime;
  date: ISODate;
  name?: string;
  durationSec: number;
  movingSec?: number;
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
  hrAvg?: number;
  hrMax?: number;
  cadenceAvg?: number;
  timeInZonesSec?: [number, number, number, number, number];
  garminTrainingLoad?: number;
  load?: number; // charge Sentier
  terrain?: Terrain;
  weather?: { tempC?: number; note?: string };
  shoeId?: Id;
  samples?: ActivitySamples;
}

export interface PainEntry {
  zone: BodyZone;
  intensity: number; // 0-10
  when?: 'pendant' | 'apres' | 'matin';
}

export interface Subjective extends Owned {
  date: ISODate;
  activityId?: Id;
  rpe?: number;
  /** Marche/course : « J'ai fait tous les intervalles ». */
  completed?: boolean;
  feeling?: 1 | 2 | 3 | 4 | 5;
  sleepHours?: number;
  sleepQuality?: 1 | 2 | 3 | 4 | 5;
  pains: PainEntry[];
  context: ('nuit_courte' | 'stress' | 'malade' | 'chaleur' | 'pas_le_temps')[];
  notes?: string;
}

export type DayState = 'vert' | 'jaune' | 'rouge';
export type HrvStatus = 'equilibre' | 'desequilibre' | 'bas' | 'faible';

export interface Wellness extends Owned {
  date: ISODate;
  state?: DayState;
  shortNight?: boolean;
  bodyBattery?: number;
  hrv?: HrvStatus;
  hrRest?: number;
  sleepHours?: number;
  sick?: boolean;
}

export interface PainLog extends Owned {
  date: ISODate;
  zone: BodyZone;
  intensity: number;
  when: 'pendant' | 'apres' | 'matin';
  note?: string;
}

// ─── Muscu ────────────────────────────────────────────────────────────────────

export interface Exercise extends Entity {
  name: string;
  category: 'force' | 'unilateral' | 'mollets' | 'gainage' | 'plyo' | 'mobilite';
  unilateral: boolean;
  defaultTempo?: string; // ex. « 3-1-1 »
  cues: string[];
}

export interface SetLog {
  exerciseId: Id;
  reps: number;
  loadKg?: number;
  rpe?: number;
  tempo?: string;
}

export interface StrengthSession extends Owned {
  date: ISODate;
  plannedSessionId?: Id;
  program: string;
  sets: SetLog[];
  notes?: string;
}

// ─── Équipement et nutrition ──────────────────────────────────────────────────

export interface Shoe extends Owned {
  name: string;
  model?: string;
  initialKm: number;
  breakInKm: number; // objectif de rodage
  retireKm: number;
  active: boolean;
  terrain: Terrain;
}

export interface NutritionProduct {
  name: string;
  carbsG: number;
  sodiumMg?: number;
  caffeineMg?: number;
  fructoseRatio?: number; // fructose / glucose
}

export interface NutritionLog extends Owned {
  date: ISODate;
  activityId?: Id;
  products: { product: NutritionProduct; count: number }[];
  fluidMl?: number;
  durationMin: number;
  giTolerance: 0 | 1 | 2 | 3 | 4 | 5; // 0 = aucun inconfort
  tempC?: number;
  notes?: string;
}

export interface PreventionCheck extends Owned {
  date: ISODate;
  routine: string;
}

export interface Milestone extends Owned {
  key: string;
  date: ISODate;
  value?: number;
}
