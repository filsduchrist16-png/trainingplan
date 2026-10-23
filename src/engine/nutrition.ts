import {
  CAFFEINE_MG_PER_KG, CARB_LOADING_G_PER_KG, CARB_LOADING_MIN_RACE_MIN, CARB_LOADING_SHORT_G_PER_KG, CARB_TARGET_BY_DURATION, FLUID_ML_PER_H, GUT_DUAL_TRANSPORT_FROM,
  GUT_START_CARBS_PER_H, GUT_STEP_CARBS_PER_H, GUT_TOLERANCE_HOLD_MAX, GUT_TOLERANCE_UP_MAX, GUT_TRAINING_MIN_MINUTES, HOT_TEMP_C, SODIUM_MG_PER_H, SODIUM_MG_PER_H_HOT,
} from './constants';
import { addDays, diffDays } from './dates';
import { explain } from './explain';
import type { Explanation, ISODate, NutritionLog, NutritionProduct } from './types';

/**
 * Nutrition d'effort : gut training progressif, plan de course et carbo-loading.
 * Ordres de grandeur prudents (pratique courante), À VALIDER ; rien ne remplace un nutritionniste du sport, surtout en cas de diabète.
 * Règle d'or répétée partout : rien de nouveau le jour de la course.
 */

export const PRODUCT_PRESETS: Record<string, NutritionProduct> = {
  gel: { name: 'Gel', carbsG: 25, sodiumMg: 50, fructoseRatio: 0.5 },
  melange: { name: 'Boisson d’effort (500 mL)', carbsG: 40, sodiumMg: 300, fructoseRatio: 0.5 },
  barre: { name: 'Barre', carbsG: 30, sodiumMg: 80 },
  banane: { name: 'Banane', carbsG: 25, sodiumMg: 1 },
};

/** Glucides visés (g/h) pour une durée d'effort : rien sous 1 h, 60 g/h jusqu'à 2 h 30, 90 g/h au-delà. */
export function carbTarget(durationMin: number): number {
  return CARB_TARGET_BY_DURATION.find(([max]) => durationMin <= max)![1];
}

// ─── Gut training ─────────────────────────────────────────────────────────────

/** Glucides par heure réellement pris lors d'une sortie. */
export function carbsPerHour(log: Pick<NutritionLog, 'products' | 'durationMin'>): number {
  const total = log.products.reduce((s, p) => s + p.product.carbsG * p.count, 0);
  return log.durationMin > 0 ? Math.round((total / log.durationMin) * 60) : 0;
}

export interface GutPlan {
  /** Plus haut niveau (g/h) toléré récemment, 0 si rien de fait. */
  tolerated: number;
  /** Cible de la prochaine sortie longue (g/h). */
  next: number;
  /** Objectif de course (g/h), plafond du gut training. */
  goal: number;
  explanation: Explanation;
}

/**
 * Prochaine cible de glucides à l'entraînement, depuis le journal de tolérance :
 * tolérance ≤ 1 → +10 g/h ; 2 → on garde ; ≥ 3 → −10 g/h. Plafonnée à l'objectif de course.
 * Seules comptent les sorties de plus de `GUT_TRAINING_MIN_MINUTES` : sous ce seuil, ce n'est pas un test digestif.
 */
export function gutPlan(logs: NutritionLog[], goalDurationMin: number): GutPlan {
  const goal = carbTarget(goalDurationMin);
  const long = [...logs].filter((l) => l.durationMin >= GUT_TRAINING_MIN_MINUTES).sort((a, b) => a.date.localeCompare(b.date));
  const last = long.at(-1);
  if (goal === 0) {
    return { tolerated: 0, next: 0, goal, explanation: explain('gut.none', 'info', 'Pas de gut training pour cet effort', 'Sous 1 h, ton corps n’a pas besoin de glucides pendant l’effort : de l’eau, et un bon repas avant. Le gut training devient utile au-delà d’une heure.', { objectif: 0 }) };
  }
  if (!last) {
    const next = Math.min(GUT_START_CARBS_PER_H, goal);
    return { tolerated: 0, next, goal, explanation: explain('gut.start', 'info', `Commence à ${next} g de glucides par heure`, `Ta prochaine sortie de plus de ${GUT_TRAINING_MIN_MINUTES} min : vise ${next} g/h (un gel de 25 g par heure), puis note comment ça passe. Objectif de course : ${goal} g/h, atteint par petits pas pour entraîner l'intestin.`, { next, objectif: goal }) };
  }
  const level = carbsPerHour(last);
  const tolerated = Math.max(0, ...long.filter((l) => l.giTolerance <= GUT_TOLERANCE_HOLD_MAX).map(carbsPerHour));
  let next: number;
  let e: Explanation;
  if (last.giTolerance <= GUT_TOLERANCE_UP_MAX) {
    next = Math.min(goal, level + GUT_STEP_CARBS_PER_H);
    e = next > level
      ? explain('gut.up', 'info', `On monte à ${next} g/h`, `${level} g/h sans inconfort la dernière fois : +${GUT_STEP_CARBS_PER_H} g/h. L'intestin s'entraîne comme un muscle, par petits pas.${next >= GUT_DUAL_TRANSPORT_FROM ? ` Au-delà de ${GUT_DUAL_TRANSPORT_FROM} g/h, prends un mélange glucose et fructose (≈ 2:1) : l'absorption double.` : ''}`, { next, objectif: goal })
      : explain('gut.goal', 'info', 'Objectif atteint', `${level} g/h bien toléré : c'est ton objectif de course (${goal} g/h). Répète-le sur 2 ou 3 longues avec les produits exacts du jour J.`, { objectif: goal });
  } else if (last.giTolerance <= GUT_TOLERANCE_HOLD_MAX) {
    next = Math.min(goal, level);
    e = explain('gut.hold', 'conseil', `On garde ${next} g/h`, `Un peu d'inconfort (${last.giTolerance}/5) à ${level} g/h : on répète ce niveau avant de monter. Bois par petites gorgées et évite d'avaler une grosse dose d'un coup.`, { next, tolerance: last.giTolerance });
  } else {
    next = Math.max(GUT_START_CARBS_PER_H, Math.min(goal, level - GUT_STEP_CARBS_PER_H));
    e = explain('gut.down', 'conseil', `On redescend à ${next} g/h`, `Inconfort à ${last.giTolerance}/5 avec ${level} g/h : c'est trop pour l'instant. On revient à ${next} g/h, plus de liquide avec les gels, et on remonte plus doucement.`, { next, tolerance: last.giTolerance });
  }
  return { tolerated, next, goal, explanation: e };
}

// ─── Plan de course ───────────────────────────────────────────────────────────

export interface FuelItem {
  /** Minutes depuis le départ. */
  atMin: number;
  product: string;
  count: number;
  carbsG: number;
}

export interface RacePlan {
  carbsPerH: number;
  fluidMlPerH: number;
  sodiumMgPerH: number;
  /** Prises de glucides, toutes les 30 min environ. */
  schedule: FuelItem[];
  totalCarbsG: number;
  totalFluidMl: number;
  caffeineMg?: number;
  caffeineAtMin?: number;
  notes: Explanation[];
}

export interface RacePlanInput {
  durationMin: number;
  /** Glucides à viser (g/h) : la cible de gut training atteinte, sinon la cible de course. */
  carbsPerH: number;
  tempC?: number;
  weightKg?: number;
  /** Produit principal (gel, mélange…), répété toutes les 30 min selon la cible. */
  product: NutritionProduct;
  /** Plan de caféine (course de plus de 3 h, avec le poids) : seulement si déjà testée à l'entraînement. */
  caffeine?: boolean;
}

/** Plan de ravitaillement : quoi prendre à quelle minute, liquides et sodium selon la température. */
export function racePlan(input: RacePlanInput): RacePlan {
  const { durationMin, product } = input;
  const carbsPerH = Math.max(0, input.carbsPerH);
  const fluidMlPerH = FLUID_ML_PER_H.find(([max]) => (input.tempC ?? 15) <= max)![1];
  const sodiumMgPerH = (input.tempC ?? 15) > HOT_TEMP_C ? SODIUM_MG_PER_H_HOT : SODIUM_MG_PER_H;
  const schedule: FuelItem[] = [];
  // Une prise toutes les 30 min, en commençant à 30 min ; la quantité vise la cible, arrondie à des unités entières.
  let owed = 0;
  for (let at = 30; at < durationMin && carbsPerH > 0; at += 30) {
    owed += carbsPerH / 2;
    const count = Math.floor(owed / product.carbsG + 0.25);
    if (count > 0) {
      schedule.push({ atMin: at, product: product.name, count, carbsG: count * product.carbsG });
      owed -= count * product.carbsG;
    }
  }
  const notes: Explanation[] = [explain('fuel.golden', 'conseil', 'Rien de nouveau le jour J', 'Teste ce plan, avec ces produits, sur au moins 2 longues sorties. Le jour de la course, tu ne changes ni produit ni dose.')];
  if (carbsPerH >= GUT_DUAL_TRANSPORT_FROM && !(product.fructoseRatio && product.fructoseRatio >= 0.4)) {
    notes.push(explain('fuel.dual', 'conseil', 'Mélange glucose et fructose', `Au-delà de ${GUT_DUAL_TRANSPORT_FROM} g/h, un produit à un seul sucre sature l'absorption. Choisis un gel ou une boisson glucose:fructose (≈ 2:1).`, { carbsPerH }));
  }
  if (durationMin >= 180 && carbsPerH === 0) notes.push(explain('fuel.none', 'attention', 'Prévois des glucides', 'Au-delà de 3 h, sans glucides, le coup de mur arrive. Même 30 g/h font une grande différence.', { duree: durationMin }));
  if ((input.tempC ?? 15) > HOT_TEMP_C) notes.push(explain('fuel.hot', 'conseil', 'Il fera chaud', `Plus de liquide (${fluidMlPerH} mL/h) et de sodium (${sodiumMgPerH} mg/h), des gorgées régulières. Ne bois pas plus que ta soif : trop d'eau seule dilue le sodium.`, { temp: input.tempC! }));
  const plan: RacePlan = {
    carbsPerH, fluidMlPerH, sodiumMgPerH, schedule, totalCarbsG: schedule.reduce((s, i) => s + i.carbsG, 0),
    totalFluidMl: Math.round((fluidMlPerH * durationMin) / 60), notes,
  };
  if (input.caffeine && input.weightKg && durationMin >= 180) {
    plan.caffeineMg = Math.round(CAFFEINE_MG_PER_KG * input.weightKg);
    plan.caffeineAtMin = Math.round((durationMin * 2) / 3 / 10) * 10;
    notes.push(explain('fuel.caffeine', 'info', `Caféine : ${plan.caffeineMg} mg à ${plan.caffeineAtMin} min`, `${CAFFEINE_MG_PER_KG} mg/kg dans le dernier tiers, quand la fatigue arrive. Seulement si tu l'as déjà testée à l'entraînement.`, { mg: plan.caffeineMg }));
  }
  return plan;
}

// ─── Carbo-loading ────────────────────────────────────────────────────────────

export interface LoadingDay {
  date: ISODate;
  /** Jours avant la course. */
  daysBefore: number;
  carbsG: number;
}

export interface CarboLoading {
  days: LoadingDay[];
  explanation: Explanation;
}

/** Plan des glucides avant la course : 8 g/kg/jour pendant 2 jours si l'effort dépasse 90 min ; sinon un bon repas la veille. */
export function carboLoading(raceDate: ISODate, raceMinutes: number, weightKg: number): CarboLoading {
  const long = raceMinutes > CARB_LOADING_MIN_RACE_MIN;
  const perKg = long ? CARB_LOADING_G_PER_KG : CARB_LOADING_SHORT_G_PER_KG;
  const daysBefore = long ? [2, 1] : [1];
  const days = daysBefore.map((d) => ({ date: addDays(raceDate, -d), daysBefore: d, carbsG: Math.round(perKg * weightKg) }));
  return {
    days,
    explanation: long
      ? explain('carboload.long', 'info', `Charge en glucides : ${days[0]!.carbsG} g par jour pendant 2 jours`, `Pour un effort de plus de ${CARB_LOADING_MIN_RACE_MIN} min : ${perKg} g/kg/jour les 2 jours avant (pâtes, riz, pain, pommes de terre), moins de fibres et de gras, ni nouveauté ni alcool. Le poids monte d'un ou deux kilos d'eau : c'est normal et utile.`, { gParKg: perKg, jours: 2 })
      : explain('carboload.short', 'info', `Un bon repas de glucides la veille (${days[0]!.carbsG} g)`, `Pour moins de ${CARB_LOADING_MIN_RACE_MIN} min, pas besoin de charge : mange normalement, avec un repas riche en glucides la veille (${perKg} g/kg sur la journée).`, { gParKg: perKg, jours: 1 }),
  };
}

/** Jours d'ici à la course : la charge commence-t-elle ? */
export function carboLoadingStatus(plan: CarboLoading, today: ISODate): 'a_venir' | 'en_cours' | 'passee' {
  const first = plan.days[0]!.date;
  const last = plan.days.at(-1)!.date;
  if (today < first) return 'a_venir';
  return diffDays(last, today) > 0 ? 'passee' : 'en_cours';
}

// ─── Tolérance par niveau ─────────────────────────────────────────────────────

export interface ToleranceBucket {
  /** Tranche de glucides par heure (borne basse, g/h). */
  from: number;
  logs: number;
  avgTolerance: number;
}

/** Tolérance moyenne par tranche de 20 g/h (0-19, 20-39…) : voir à partir de quel niveau l'intestin proteste. */
export function toleranceByLevel(logs: NutritionLog[]): ToleranceBucket[] {
  const buckets = new Map<number, number[]>();
  for (const l of logs.filter((x) => x.durationMin >= GUT_TRAINING_MIN_MINUTES)) {
    const from = Math.floor(carbsPerHour(l) / 20) * 20;
    buckets.set(from, [...(buckets.get(from) ?? []), l.giTolerance]);
  }
  return [...buckets.entries()].sort(([a], [b]) => a - b).map(([from, t]) => ({ from, logs: t.length, avgTolerance: Math.round((t.reduce((s, x) => s + x, 0) / t.length) * 10) / 10 }));
}
