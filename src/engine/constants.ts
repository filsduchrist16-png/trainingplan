/**
 * Constantes du moteur de coaching.
 *
 * Chaque seuil est nommé et commenté avec le principe qu'il applique.
 * `À VALIDER` = chiffre raisonnable tiré de la pratique courante d'entraînement, mais sans
 * consensus scientifique net : il reste configurable et peut être révisé sans toucher à la logique.
 */

// ─── Zones cardiaques ─────────────────────────────────────────────────────────

/**
 * Bornes supérieures de Z1 à Z4 en fraction de la FCmax.
 * Pour FCmax 190 : Z1 < 123, Z2 123-143, Z3 143-162, Z4 162-176, Z5 176-190.
 * Modèle 5 zones classique ; Z2 = « je peux parler en phrases complètes ».
 */
export const HR_ZONE_FRACTIONS = [0.647, 0.753, 0.853, 0.926] as const;

/** Estimation de la FCmax par l'âge (formule de Tanaka : 208 − 0,7 × âge). Imprécise à ±10 bpm : on propose un test. */
export const TANAKA_INTERCEPT = 208;
export const TANAKA_SLOPE = 0.7;

/**
 * « Zone grise » : haut de Z2 / bas de Z3, trop dur pour être facile, trop facile pour être une vraie qualité.
 * En fraction de FCmax (≈ 145-155 bpm pour FCmax 190).
 */
export const GREY_ZONE_FRACTIONS = [0.763, 0.816] as const;

// ─── Allures (VDOT, équations de Daniels-Gilbert) ─────────────────────────────

/**
 * Fraction du VDOT sollicitée par type d'allure.
 * E (facile) ≈ 59-74 % → milieu de fourchette ; T (seuil) ≈ 88 % ; I (intervalles) ≈ 97-100 % ; R (répétitions) > VO2max.
 * À VALIDER : fractions usuelles des tables VDOT, arrondies.
 */
export const PACE_FRACTIONS = { E: 0.7, T: 0.88, I: 0.975, R: 1.05 } as const;

/** Bornes plausibles du VDOT (débutant très lent → élite). En dehors, on refuse l'estimation. */
export const VDOT_MIN = 20;
export const VDOT_MAX = 85;

/**
 * Allure facile par défaut (min/km) si aucune référence de forme. Volontairement lente :
 * mieux vaut sous-estimer au départ que pousser un débutant en Z3.
 */
export const DEFAULT_EASY_PACE_MIN_PER_KM = 7;

/** En trail, une sortie facile prend plus de temps qu'en route au même effort. À VALIDER. */
export const TRAIL_PACE_FACTOR = 1.2;

/** Règle empirique : 100 m de D+ ≈ 1 km à plat en coût d'effort (approx. « km-effort »). À VALIDER. */
export const KM_EFFORT_PER_100M_GAIN = 1;

// ─── Charge et ACWR ───────────────────────────────────────────────────────────

/** Poids par zone (minutes × poids), type TRIMP d'Edwards. */
export const ZONE_LOAD_WEIGHTS = [1, 2, 3, 4, 5] as const;

/** Bonus de charge par 100 m de D+ : ≈ 6 min à poids Z2 (2) → 12. À VALIDER. */
export const ELEVATION_LOAD_PER_100M = 12;

/** Fenêtres de l'ACWR (jours). */
export const ACUTE_DAYS = 7;
export const CHRONIC_DAYS = 28;

/**
 * Zone « verte » de l'ACWR. Sa valeur PRÉDICTIVE des blessures est débattue dans la littérature :
 * l'app l'utilise comme indicateur de tendance, jamais comme prédiction.
 */
export const ACWR_LOW = 0.8;
export const ACWR_HIGH = 1.3;
export const ACWR_DANGER = 1.5;

/** Jours d'historique nécessaires avant d'afficher un ACWR (sinon : « calibration »). */
export const ACWR_MIN_HISTORY_DAYS = 28;

// ─── Progression ──────────────────────────────────────────────────────────────

/** Hausse hebdomadaire maximale du volume (règle des 10 %). */
export const MAX_WEEKLY_INCREASE = 0.1;

/** La hausse se mesure contre le max des N dernières semaines hors décharge (pas la semaine précédente). */
export const PROGRESSION_REFERENCE_WEEKS = 4;

/** Une semaine sous ce ratio de la référence est considérée comme une décharge (ou une semaine de vie). */
export const DELOAD_DETECTION_RATIO = 0.8;

/** Décharge : volume à 60-70 % du niveau courant → 65 %. */
export const DELOAD_RATIO = 0.65;

/** Cycle de charge : N semaines de build, puis 1 de décharge. 3:1 par défaut, 2:1 si on manque de récupération. */
export const BUILD_WEEKS_BEFORE_DELOAD = 3;

/** Semaine « maintien » (fatigue de vie cumulée) : 60-70 % du volume, 0 qualité. */
export const MAINTENANCE_RATIO = 0.65;

// ─── Taper et récupération ────────────────────────────────────────────────────

/** Volume de chaque semaine de taper en fraction du pic, de la plus éloignée à la semaine de course. */
export const TAPER_PROFILES: Record<1 | 2 | 3, number[]> = {
  1: [0.6],
  2: [0.6, 0.4], // −40 % puis −60 %
  3: [0.8, 0.6, 0.4],
};

/** Course B (« effort test ») : mini-taper sur la semaine de course, reprise facile la semaine suivante. */
export const B_RACE_WEEK_RATIO = 0.75;
export const B_RACE_RECOVERY_RATIO = 0.8;

/** Récupération post-course A : semaines de reprise et volume relatif au pic. À VALIDER. */
export const RECOVERY_WEEKS_BY_DISTANCE: { maxKm: number; weeks: number }[] = [
  { maxKm: 15, weeks: 1 },
  { maxKm: 45, weeks: 2 },
  { maxKm: Infinity, weeks: 3 },
];
export const RECOVERY_VOLUME_RATIOS = [0.35, 0.55, 0.7];

// ─── Séances clés ─────────────────────────────────────────────────────────────

/** Pas de VO2max avant N semaines de base solide. */
export const VO2_MIN_BASE_WEEKS = 4;
/** Max de séances clés par semaine (3 seulement en phase pic, si l'état le permet). */
export const MAX_KEY_SESSIONS = 2;
export const MAX_KEY_SESSIONS_PEAK = 3;
/** Délai minimum entre deux séances qualité (heures). */
export const MIN_HOURS_BETWEEN_KEYS = 48;

/** Part maximale du volume hebdo dans la sortie longue. */
export const LONG_RUN_SHARE_MAX = 0.4;

// ─── Santé et red flags ───────────────────────────────────────────────────────

/** Douleur tibiale (ou tendineuse) : seuils sur l'échelle 0-10. */
export const PAIN_WARNING = 1;
export const PAIN_STOP = 3;
/** Jours consécutifs de douleur déclarée → douleur « persistante » → STOP course. */
export const PAIN_PERSISTENT_DAYS = 2;
/** Jours de douleur → suggestion de consulter. */
export const PAIN_SEE_PRO_DAYS = 5;
/** Jours sans douleur avant de lever le blocage des séances de course dures. */
export const PAIN_FREE_DAYS_TO_RESUME = 3;
/** Douleur tendineuse au-delà de 48 h = red flag. */
export const TENDON_PAIN_FLAG_HOURS = 48;

/** Body Battery bas plusieurs matins. */
export const BODY_BATTERY_LOW = 20;
export const BODY_BATTERY_LOW_MORNINGS = 2;
/** HRV « bas/déséquilibré » plus de N jours. */
export const HRV_BAD_DAYS = 3;
/** FC repos au-dessus de la baseline. */
export const HR_REST_ELEVATION_BPM = 5;
/** Nuit courte (h). Sous le seuil sévère (nouveau-né…), on déplace la qualité. */
export const SHORT_NIGHT_HOURS = 6;
export const VERY_SHORT_NIGHT_HOURS = 4;

// ─── Debrief ──────────────────────────────────────────────────────────────────

/** Dérive cardiaque (découplage FC/allure entre 1re et 2e moitié) : < 5 % = bonne endurance aérobie. */
export const CARDIAC_DRIFT_OK = 0.05;
/** Part du temps hors zone tolérée sur une séance facile avant de le signaler. */
export const EASY_OUT_OF_ZONE_TOLERANCE = 0.15;
/** Part du temps en zone grise sur une Z2 avant de le signaler. */
export const GREY_ZONE_TOLERANCE = 0.2;

// ─── Adaptation de la forme (à la Runna) ──────────────────────────────────────

/** Nombre de séances qualité concordantes avant d'ajuster le VDOT. Une séance isolée ne suffit pas. */
export const FITNESS_UPDATE_MIN_SESSIONS = 3;
/** Écart d'allure moyen (fraction) pour juger une cible « dépassée » ou « ratée ». */
export const FITNESS_UPDATE_THRESHOLD = 0.03;
/** Pas d'ajustement du VDOT, prudent. */
export const FITNESS_UPDATE_STEP = 1;

// ─── Périodisation ────────────────────────────────────────────────────────────

/** Répartition des semaines hors taper : base / spécifique 1 / spécifique 2 (pic) / pré-compétition (bloc de 27 sem. → 9/7/6/3 + 2 taper). */
export const PHASE_RATIOS = { spec1: 0.28, spec2: 0.24, precomp: 0.12 } as const;

/**
 * Marche-course : on démarre ainsi quand la capacité de course CONTINUE est sous ce seuil (minutes), selon l'expérience.
 * Ce n'est pas le volume hebdo qui compte (3 × 4 km est continu, 10 × 1 km ne l'est pas) mais ce qu'on peut courir d'une traite.
 * Jamais couru : 30 min (os, tendons et périoste ne sont pas adaptés, même si le souffle suit).
 * Débutant : 20 min. Régulier : 10 min (reprise après une longue pause). Avancé : jamais. À VALIDER.
 */
export const RUN_WALK_BELOW_CONTINUOUS_MIN = { jamais: 30, debutant: 20, regulier: 10, avance: 0 } as const;
/**
 * Échelle de marche/course, paliers 1 à 13 (esprit Couch to 5K). Chaque séance = 5 min de marche rapide
 * + le bloc + 5 min de marche lente, soit 30 à 45 min. Le temps de course total ne monte jamais de plus
 * de 25 % d'un palier au suivant. Le palier 13 = 20 min continues. À VALIDER par un professionnel.
 */
export const RUN_WALK_LADDER = [
  { runSec: 30, walkSec: 60, reps: 14 },
  { runSec: 60, walkSec: 90, reps: 8 },
  { runSec: 60, walkSec: 60, reps: 10 },
  { runSec: 90, walkSec: 60, reps: 8 },
  { runSec: 120, walkSec: 60, reps: 7 },
  { runSec: 180, walkSec: 60, reps: 5 },
  { runSec: 240, walkSec: 60, reps: 4 },
  { runSec: 300, walkSec: 60, reps: 4 },
  { runSec: 420, walkSec: 60, reps: 3 },
  { runSec: 600, walkSec: 60, reps: 2 },
  { runSec: 720, walkSec: 60, reps: 2 },
  { runSec: 900, walkSec: 60, reps: 2 },
  { runSec: 1200, walkSec: 0, reps: 1 },
] as const;
export const RUN_WALK_WARMUP_MIN = 5;
export const RUN_WALK_COOLDOWN_MIN = 5;
/** Transition continue : 20 → 30 min de course facile (20 = palier 13), un palier par 2 séances validées. */
export const CONTINUOUS_TRANSITION_MIN = [20, 22, 24, 26, 28, 30] as const;
/** Allure de marche pour estimer les km affichés (min/km). À VALIDER. */
export const WALK_PACE_MIN_PER_KM = 11;
/** Marche d'abord (niveau 0) : de 20 à 30 min, +5 min par séance validée ; sortie : 30 min validées 2 fois de suite. */
export const WALK_FIRST_START_MIN = 20;
export const WALK_FIRST_STEP_MIN = 5;
export const WALK_FIRST_TARGET_MIN = 30;
/** Après le démarrage : au moins 4 semaines de base, sans séance clé, avant les phases de l'objectif. */
export const BASE_WEEKS_AFTER_RUNWALK = 4;
/** Z2 minimum avant des strides : en dessous, la séance devient une sortie facile. À VALIDER (pratique courante). */
export const STRIDES_MIN_BASE_MIN = 10;
/** Strides et sprints en côte seulement quand on court au moins 30 min d'affilée (sortie longue ≥ 30 min). */
export const STRIDES_MIN_CONTINUOUS_MIN = 30;
/** Démarrage : au plus 3 séances par semaine, jamais deux jours de suite. */
export const RUN_WALK_MAX_SESSIONS_PER_WEEK = 3;
/** Le jour de la longue, pendant le démarrage : même palier, plus 10 min de marche. */
export const RUN_WALK_LONG_DAY_EXTRA_WALK_MIN = 10;
/** Le 1er intervalle vaut au plus la moitié de ce qu'on court d'une traite : on garde de la marge. */
export const RUN_WALK_FIRST_INTERVAL_SHARE = 0.5;
/** Volume de départ minimal d'un plan démarrage (≈ 3 × 20 min de marche-course). */
export const DEMARRAGE_START_KM = 6;

/** Longueur maximale d'un plan. Au-delà, le plan démarre plus tard et on garde la forme d'ici là. */
export const MAX_PLAN_WEEKS = 52;

/** Pas de décharge dans les 2 premières semaines d'un plan. */
export const MIN_WEEKS_BEFORE_FIRST_DELOAD = 2;

/** Part de la sortie longue dans le volume hebdo, par phase. */
export const LONG_RUN_SHARE_BY_PHASE = {
  demarrage: 0.35, base: 0.28, spec1: 0.3, spec2: 0.33, precomp: 0.33, taper: 0.25, recup: 0.25, maintien: 0.28,
} as const;

/**
 * Objectifs longs (marathon, trail moyen, ultra) : la longue pèse plus lourd en spécifique,
 * jusqu'à LONG_RUN_SHARE_MAX, pour atteindre 4 h à 5 h en pré-compétition sur un trail de ~40 km.
 */
export const LONG_RUN_SHARE_LONG_GOALS = { spec1: 0.35, spec2: 0.4, precomp: 0.4 } as const;
/** Seuil (minutes de longue max de l'objectif) au-delà duquel un objectif est « long ». */
export const LONG_GOAL_MIN_LONG_RUN_MIN = 180;

/**
 * Croissance de la sortie longue : +10 % de la plus longue sortie récente, sans pas minimum
 * (décision validée : « +10 % max » pour tout le monde, la longue arrondie au 0,1 km inférieur et à la minute).
 */
export const LONG_RUN_GROWTH = 0.1;
/** Sans plus longue sortie déclarée, on suppose que le volume hebdo se répartit sur ce nombre de sorties. */
export const ASSUMED_RUNS_PER_WEEK = 3;

/** D+ hebdo cible (trail) = km × (D+/km de la course) × facteur de phase. Descentes et D+ montent progressivement. */
export const ELEVATION_PHASE_FACTOR = {
  demarrage: 0.2, base: 0.5, spec1: 0.8, spec2: 1, precomp: 1, taper: 0.6, recup: 0.3, maintien: 0.5,
} as const;

// ─── Planification hebdo ──────────────────────────────────────────────────────

/** Sortie facile minimale : en dessous, mieux vaut un jour de repos. */
export const MIN_EASY_RUN_KM = 3;
/** Durée d'une séance de muscu (min). */
export const STRENGTH_SESSION_MIN = 45;
/** Au-delà de cette durée, la sortie inclut du gut training (glucides pendant l'effort). */
export const GUT_TRAINING_MIN_MINUTES = 75;


// ─── Progression du parcours marche/course (validation par séance) ────────────

/** Séances validées DE SUITE pour passer au palier suivant (3 en profil « lent »). À VALIDER. */
export const RUN_WALK_VALIDATIONS = 2;
export const RUN_WALK_VALIDATIONS_SLOW = 3;
/** RPE maximal d'une séance validée (« je pouvais parler ») ; au-delà de ce seuil, c'est un échec. */
export const RUN_WALK_MAX_RPE_OK = 5;
export const RUN_WALK_RPE_FAIL = 8;
/** Échecs de suite au même palier avant de reculer d'un palier. */
export const RUN_WALK_FAILS_TO_STEP_BACK = 2;
/** Douleur (0-10) qui bloque l'avancement (≥ 1) ou fait reculer (≥ 3), déclarée le jour même ou le lendemain. */
export const RUN_WALK_PAIN_HOLD = 1;
export const RUN_WALK_PAIN_BACK = 3;
/** Trous sans séance (jours) : répéter le palier, reculer de 2 paliers, ou repartir du point d'entrée. */
export const RUN_WALK_GAP_REPEAT_DAYS = 7;
export const RUN_WALK_GAP_BACK_DAYS = 14;
export const RUN_WALK_GAP_RESTART_DAYS = 28;
export const RUN_WALK_GAP_BACK_STAGES = 2;

// ─── Questionnaire santé (dépistage) ──────────────────────────────────────────
/** Le questionnaire santé est à refaire tous les 12 mois (et dès qu'une réponse change). */
export const HEALTH_RENEW_DAYS = 365;
/** Plan prudent (dépistage) : semaines du début sans intensité au-dessus de Z2 (ni séance clé, ni strides, ni test). À VALIDER. */
export const HEALTH_PRUDENT_EASY_WEEKS = 4;

// ─── Profils (âge, IMC, santé, blessure) ── seuils À VALIDER par un professionnel ──
/** Âge à partir duquel le profil est « lent » (3 validations par palier, décharge 2:1). À VALIDER. */
export const PROFILE_SLOW_AGE = 60;
/** 50 ans et plus : cycle 2:1 par défaut, au plus 1 séance clé pour qui débute, muscu 2×/sem conseillée. À VALIDER. */
export const PROFILE_MASTERS_AGE = 50;
/** 65 ans et plus : marche/course si capacité < 20 min, équilibre en muscu, pas de VO2max sans base. À VALIDER. */
export const PROFILE_SENIOR_AGE = 65;
/** Mineur : pas de marathon, trail moyen ni ultra ; difficulté au plus « équilibré ». */
export const PROFILE_MINOR_AGE = 18;
/** IMC à partir duquel le profil est « lent », sans jours de course consécutifs. À VALIDER. */
export const PROFILE_BMI_SLOW = 30;
/** Blessure « récente » (semaines × 7) : expérience rétrogradée d'un niveau. À VALIDER. */
export const PROFILE_RECENT_INJURY_DAYS = 84;
/** Capacité continue minimale (min) sous laquelle 65+ et retour de blessure récente commencent en marche/course. À VALIDER. */
export const PROFILE_RUNWALK_MIN_CAPACITY = 20;
/** Cycle de décharge des profils lents et des 50+ : 2 semaines de charge, 1 de décharge. À VALIDER. */
export const PROFILE_BUILD_WEEKS_BEFORE_DELOAD = 2;
/** 50+ qui débute : au plus 1 séance clé par semaine. À VALIDER. */
export const PROFILE_MASTERS_MAX_KEY_NOVICE = 1;
/** Diabète : note « sucre rapide, glycémie » sur les séances de plus de 45 min. À VALIDER. */
export const PROFILE_DIABETES_NOTE_MIN = 45;
/** Effort perçu (RPE) par zone, pour les zones sans cardio (FC non fiable). */
export const ZONE_RPE: Record<'z1' | 'z2' | 'z3' | 'z4' | 'z5', [number, number]> = { z1: [1, 2], z2: [3, 4], z3: [5, 6], z4: [7, 8], z5: [9, 10] };
/**
 * Post-partum : pas de course avant 3 mois (≈ 13 semaines), puis test de reprise.
 * Source : Goom, Donnelly et Brockwell (2019), « Returning to running postnatal ». À VALIDER (physio périnéale).
 */
export const POSTPARTUM_NO_RUN_DAYS = 91;

// ─── Disponibilité réduite ────────────────────────────────────────────────────
/** 2 sorties par semaine : aucune séance clé tant que la sortie longue (course continue) fait moins de 30 min. */
export const TWO_DAYS_KEY_MIN_CONTINUOUS = 30;
/** Séance d'évaluation (« Je sais pas ») : 5 min de marche, puis course facile jusqu'à 10 min au plus. À VALIDER. */
export const EVALUATION_WALK_MIN = 5;
export const EVALUATION_MAX_RUN_MIN = 10;
/** Au-delà de cette distance (km), courir l'épreuve en marche/course n'est plus une option raisonnable : objectif irréaliste. À VALIDER. */
export const RUNWALK_RACE_MAX_KM = 10;

// ─── Muscu (programmes et double progression) ── schémas À VALIDER (pratique courante) ──
/** Incrément de charge quand toutes les séries atteignent le haut de la fourchette (kg). */
export const STRENGTH_LOAD_STEP_KG = 2.5;
/** RPE au-delà duquel on ne monte pas la charge, même si les reps sont atteintes. */
export const STRENGTH_PROGRESS_MAX_RPE = 8;
/** Séances de force : débutants plafonnés à 3 séries, fourchettes de reps plus hautes (technique d'abord). */
export const STRENGTH_NOVICE_MAX_SETS = 3;
/** Repos par défaut entre deux séries (s), selon l'objectif de la phase. */
export const STRENGTH_REST_SEC = { fondation: 60, force: 120, maintien: 90 } as const;
