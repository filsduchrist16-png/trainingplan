import { VERY_SHORT_NIGHT_HOURS } from './constants';
import { explain } from './explain';
import type { HealthStatus } from './guards';
import { SESSION_LIBRARY, isRunType } from './library';
import { validateMove, type MovableSession } from './scheduling';
import type { CrossTraining, DayState, Explanation, ISODate, SessionType, Step } from './types';

/**
 * Ajustement de la séance du jour selon l'état déclaré (3 taps) et les garde-fous santé.
 * Ordre strict : santé → état du jour → séance prévue. Le plan s'adapte à la vie, jamais l'inverse.
 */

export interface TodaySession {
  type: SessionType;
  title: string;
  durationMin: number;
  distanceKm?: number;
  steps: Step[];
  isKey: boolean;
  why: string;
}

export type DayAction = 'garder' | 'alleger' | 'remplacer' | 'repos' | 'deplacer';

export interface DayDecision {
  action: DayAction;
  session: TodaySession;
  explanations: Explanation[];
  /** La séance clé gagnerait à être déplacée plus tard dans la semaine. */
  moveQuality: boolean;
}

export interface DayInput {
  session: TodaySession;
  state?: DayState;
  shortNight?: boolean;
  sleepHours?: number;
  health: HealthStatus;
  crossTraining: CrossTraining[];
}

const round5 = (m: number) => Math.max(10, Math.round(m / 5) * 5);
const CROSS_LABEL: Record<CrossTraining, string> = { velo: 'Vélo', home_trainer: 'Home trainer', natation: 'Natation', elliptique: 'Elliptique', marche: 'Marche' };

export function easySession(minutes: number, zone: 'z1' | 'z2' = 'z2'): TodaySession {
  const m = round5(minutes);
  const type = zone === 'z1' ? 'z1_recup' : 'z2_endurance';
  return { type, title: `${zone === 'z1' ? 'Z1' : 'Z2'} ${m} min`, durationMin: m, steps: [{ kind: 'continu', minutes: m, target: { zone } }], isKey: false, why: SESSION_LIBRARY[type].oneLiner };
}

export function crossSession(minutes: number, mode: CrossTraining): TodaySession {
  const m = round5(Math.min(minutes, 75));
  return { type: 'croise', title: `${CROSS_LABEL[mode]} Z2 ${m} min`, durationMin: m, steps: [{ kind: 'continu', minutes: m, target: { zone: 'z2' } }], isKey: false, why: SESSION_LIBRARY.croise.oneLiner };
}

export function restSession(): TodaySession {
  return { type: 'repos', title: 'Repos', durationMin: 0, steps: [], isKey: false, why: SESSION_LIBRARY.repos.oneLiner };
}

/** Réduit une séance : durées continues et nombre de répétitions × facteur. */
export function scaleSession(s: TodaySession, factor: number): TodaySession {
  const steps = s.steps.map((st) => {
    if (st.kind === 'effort' && st.repeat) return { ...st, repeat: Math.max(1, Math.round(st.repeat * factor)) };
    if ((st.kind === 'continu' || st.kind === 'effort') && st.minutes) return { ...st, minutes: round5(st.minutes * factor) };
    return st;
  });
  return {
    ...s,
    title: `${s.title} (allégée)`,
    durationMin: Math.round(s.durationMin * factor),
    ...(s.distanceKm ? { distanceKm: Math.round(s.distanceKm * factor * 10) / 10 } : {}),
    steps,
  };
}

const isLong = (t: SessionType) => t === 'longue_facile' || t === 'longue_specifique' || t === 'back_to_back';

export function adjustToday(input: DayInput): DayDecision {
  const { session, health } = input;
  const run = isRunType(session.type) && session.type !== 'course';
  const ex: Explanation[] = [];
  const decide = (action: DayAction, s: TodaySession, moveQuality = false): DayDecision => ({ action, session: s, explanations: ex, moveQuality });

  if (session.type === 'repos') {
    ex.push(explain('day.rest', 'info', 'Jour de repos', 'Profite. La forme se construit aujourd’hui.'));
    return decide('garder', session);
  }

  // ── 1. Santé ──────────────────────────────────────────────────────────────
  if (run && health.blockAllRunning) {
    ex.push(...health.explanations.filter((e) => e.severity === 'stop'));
    const mode = input.crossTraining[0];
    if (mode) return decide('remplacer', crossSession(session.durationMin, mode));
    ex.push(explain('day.nocross', 'conseil', 'Repos plutôt que course', 'Pas d’entraînement croisé configuré : repos complet. Ajoute vélo ou natation dans ton profil pour garder le moteur au chaud.'));
    return decide('repos', restSession());
  }
  if (health.level === 'repos' || health.level === 'decharge') {
    ex.push(...health.explanations.filter((e) => e.ruleId.startsWith('protocol') || e.ruleId.startsWith('flag')));
    return decide('repos', restSession(), session.isKey);
  }
  if (run && (health.level === 'alleger' || health.noQuality) && (session.isKey || isLong(session.type))) {
    ex.push(...health.explanations.filter((e) => e.severity !== 'info'));
    ex.push(explain('day.health.easy', 'conseil', 'Séance remplacée par du facile', 'Un signal santé est allumé : on garde du Z2 court aujourd’hui. La qualité reviendra quand le corps dira oui.'));
    return decide('remplacer', easySession(Math.min(45, session.durationMin * 0.6)), session.isKey);
  }
  if (run && health.level === 'alleger') {
    ex.push(...health.explanations.filter((e) => e.severity !== 'info'));
    return decide('alleger', scaleSession(session, 0.7));
  }

  // ── 2. État du jour ───────────────────────────────────────────────────────
  if (input.state === 'rouge') {
    ex.push(explain('day.red', 'conseil', 'Brûlé : repos', 'Quand tu te sens brûlé, une séance de plus ne t’amène nulle part. Repos, ou la version minimale si bouger te fait du bien.'));
    return decide('repos', restSession(), session.isKey);
  }
  const veryShort = input.sleepHours !== undefined && input.sleepHours < VERY_SHORT_NIGHT_HOURS;
  if (input.shortNight || veryShort) {
    if (session.isKey && run) {
      ex.push(explain('day.shortnight.key', 'conseil', 'Nuit courte : qualité déplacée', `${veryShort ? 'Moins de 4 h de sommeil' : 'Nuit courte'} : une séance dure sur la fatigue rapporte peu et use beaucoup. On la déplace plus tard dans la semaine ; aujourd’hui, Z2 court ou repos.`));
      return decide('deplacer', veryShort ? restSession() : easySession(30), true);
    }
    if (!run) {
      ex.push(explain('day.shortnight.strength', 'conseil', 'Nuit courte : muscu allégée', 'Garde la technique, baisse les charges, ou passe ton tour.'));
      return decide('alleger', { ...session, title: `${session.title} (allégée)` });
    }
    if (veryShort) {
      ex.push(explain('day.veryshort', 'conseil', 'Moins de 4 h de sommeil', 'Repos, ou 20 min en Z1 si ça te fait du bien. Zéro culpabilité : c’est la décision intelligente.'));
      return decide('repos', restSession());
    }
    ex.push(explain('day.shortnight', 'conseil', 'Nuit courte : on raccourcit', 'Même séance, 30 % plus courte. Le sommeil, c’est là que l’entraînement se transforme en forme.'));
    return decide('alleger', scaleSession(session, 0.7));
  }
  if (input.state === 'jaune') {
    ex.push(explain('day.yellow', 'info', 'Moyen : version allégée', session.isKey ? 'On garde la séance, une répétition de moins environ. Si ça ne lève pas après l’échauffement, passe en Z2.' : 'Un peu plus court, même intensité.'));
    return decide('alleger', scaleSession(session, session.isKey ? 0.75 : 0.8));
  }

  ex.push(explain('day.go', 'info', 'Go', 'En forme : on fait la séance prévue.'));
  return decide('garder', session);
}

/**
 * Trouve le meilleur jour pour déplacer une séance clé dans la semaine :
 * le premier jour suivant, actuellement facile ou au repos, sans conflit de 48 h.
 */
export function findMoveTarget(week: (MovableSession & { type: SessionType })[], id: string, weekEnd: ISODate): ISODate | null {
  const moved = week.find((s) => s.id === id);
  if (!moved) return null;
  const candidates = [...new Set(week.map((s) => s.date))].filter((d) => d > moved.date && d <= weekEnd).sort();
  for (const d of candidates) {
    const sameDay = week.filter((s) => s.date === d && s.id !== id);
    if (sameDay.some((s) => s.isKey || isLong(s.type) || s.type === 'course')) continue;
    const others = week.filter((s) => !(s.date === d && isRunType(s.type)));
    const problems = validateMove(others, id, d).filter((e) => e.severity === 'attention' || e.severity === 'stop');
    if (problems.length === 0) return d;
  }
  return null;
}
