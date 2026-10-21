import {
  BODY_BATTERY_LOW, BODY_BATTERY_LOW_MORNINGS, HR_REST_ELEVATION_BPM, HRV_BAD_DAYS, PAIN_FREE_DAYS_TO_RESUME,
  PAIN_PERSISTENT_DAYS, PAIN_SEE_PRO_DAYS, PAIN_STOP, PAIN_WARNING, SHORT_NIGHT_HOURS, TENDON_PAIN_FLAG_HOURS,
} from './constants';
import { addDays, diffDays } from './dates';
import { bySeverity, explain } from './explain';
import type { BodyZone, DayState, Explanation, HrvStatus, InjuryRecord, ISODate } from './types';

/**
 * Garde-fous santé — priorité absolue.
 *
 * Principe cardinal : aucun gain de forme ne vaut une blessure. Quand le moteur doit choisir, il choisit la santé,
 * et il le dit clairement. Ces règles passent AVANT l'état du jour, la progression et les préférences.
 */

export type HealthLevel = 'ok' | 'prudence' | 'alleger' | 'repos' | 'decharge' | 'stop_course';
const LEVEL_ORDER: HealthLevel[] = ['ok', 'prudence', 'alleger', 'repos', 'decharge', 'stop_course'];

export interface HealthInput {
  today: ISODate;
  pain: { date: ISODate; zone: BodyZone; intensity: number }[];
  wellness: { date: ISODate; bodyBattery?: number; hrv?: HrvStatus; hrRest?: number; sick?: boolean; shortNight?: boolean; sleepHours?: number; state?: DayState }[];
  hrRestBaseline: number;
  injuries?: InjuryRecord[];
}

export interface HealthStatus {
  level: HealthLevel;
  flags: string[];
  explanations: Explanation[];
  /** Interdit les séances de course dures (qualité, longue spécifique). */
  blockHardRunning: boolean;
  /** Interdit toute course : substitution vélo/natation. */
  blockAllRunning: boolean;
  /** Interdit toute hausse de volume cette semaine. */
  noIncrease: boolean;
  noQuality: boolean;
  suggestPro: boolean;
  recommendDeload: boolean;
  recommendMaintenanceWeek: boolean;
}

const SHIN: BodyZone[] = ['tibia_g', 'tibia_d', 'soleaire_g', 'soleaire_d'];
const TENDON: BodyZone[] = ['achille_g', 'achille_d'];
const LOOKBACK_DAYS = 14;

const ZONE_LABEL: Record<BodyZone, string> = {
  tibia_g: 'tibia gauche', tibia_d: 'tibia droit', soleaire_g: 'soléaire gauche', soleaire_d: 'soléaire droit',
  achille_g: 'Achille gauche', achille_d: 'Achille droit', itb_g: 'bandelette gauche', itb_d: 'bandelette droite',
  genou_g: 'genou gauche', genou_d: 'genou droit', hanche_g: 'hanche gauche', hanche_d: 'hanche droite',
  pied_g: 'pied gauche', pied_d: 'pied droit', dos: 'dos', autre: 'autre zone',
};
export const zoneLabel = (z: BodyZone) => ZONE_LABEL[z];

interface PainSummary {
  zones: BodyZone[];
  /** Douleur « actuelle » : max déclaré aujourd'hui ou hier. */
  current: number;
  /** Jours consécutifs de douleur se terminant au dernier jour déclaré. */
  streak: number;
  painDays: number;
  lastPain?: ISODate;
  max: number;
}

function summarize(input: HealthInput, zones: BodyZone[]): PainSummary {
  const since = addDays(input.today, -LOOKBACK_DAYS);
  const byDay = new Map<ISODate, number>();
  for (const p of input.pain) {
    if (!zones.includes(p.zone) || p.date < since || p.date > input.today || p.intensity < PAIN_WARNING) continue;
    byDay.set(p.date, Math.max(byDay.get(p.date) ?? 0, p.intensity));
  }
  const days = [...byDay.keys()].sort();
  const lastPain = days.at(-1);
  let streak = 0;
  if (lastPain) for (let d = lastPain; byDay.has(d); d = addDays(d, -1)) streak++;
  const current = Math.max(byDay.get(input.today) ?? 0, byDay.get(addDays(input.today, -1)) ?? 0);
  return { zones, current, streak, painDays: days.length, lastPain, max: Math.max(0, ...byDay.values()) };
}

export function evaluateHealth(input: HealthInput): HealthStatus {
  const ex: Explanation[] = [];
  const flags: string[] = [];
  let level: HealthLevel = 'ok';
  const raise = (l: HealthLevel) => {
    if (LEVEL_ORDER.indexOf(l) > LEVEL_ORDER.indexOf(level)) level = l;
  };
  let blockHardRunning = false;
  let blockAllRunning = false;
  let noIncrease = false;
  let noQuality = false;
  let suggestPro = false;

  // ── Tibia / soléaire (périostite) : garde-fou n° 1 ────────────────────────
  const shin = summarize(input, SHIN);
  const shinHistory = input.injuries?.some((i) => SHIN.includes(i.zone) && i.status !== 'resolue');
  const daysSinceShin = shin.lastPain ? diffDays(shin.lastPain, input.today) : Infinity;
  if (shin.lastPain && daysSinceShin <= 1 && (shin.current >= PAIN_STOP || shin.streak >= PAIN_PERSISTENT_DAYS)) {
    raise('stop_course');
    blockAllRunning = true;
    blockHardRunning = true;
    noIncrease = true;
    ex.push(explain('shin.stop', 'stop', 'STOP course', `Douleur au tibia ${shin.streak >= PAIN_PERSISTENT_DAYS ? `depuis ${shin.streak} jours` : `à ${shin.current}/10`}. On arrête la course : vélo ou natation à la place, même durée en Z2. Une périostite qu'on pousse, c'est des semaines perdues ; une qu'on écoute, c'est quelques jours.${shinHistory ? ' Avec ton historique, on ne joue pas avec ça.' : ''}`, { douleur: shin.current, jours: shin.streak }));
  } else if (shin.lastPain && daysSinceShin <= 1) {
    raise('prudence');
    noIncrease = true;
    blockHardRunning = true;
    ex.push(explain('shin.warning', 'attention', 'Tibia sous surveillance', `Douleur tibiale déclarée (${shin.current}/10). Pas de hausse de volume ni de séance dure tant que ce n'est pas réglé. Si ça revient demain, c'est STOP course.`, { douleur: shin.current }));
  } else if (shin.lastPain && daysSinceShin < PAIN_FREE_DAYS_TO_RESUME + 1) {
    raise('prudence');
    blockHardRunning = true;
    noIncrease = true;
    ex.push(explain('shin.resume', 'conseil', 'Reprise progressive', `Plus de douleur depuis ${daysSinceShin} jour(s). On reprend en Z1/Z2 seulement ; la qualité revient après ${PAIN_FREE_DAYS_TO_RESUME} jours sans douleur.`, { jours: daysSinceShin }));
  }
  if (shin.painDays >= PAIN_SEE_PRO_DAYS) {
    suggestPro = true;
    ex.push(explain('shin.pro', 'attention', 'Consulte un physio', `${shin.painDays} jours de douleur au tibia sur 2 semaines. Un physio peut distinguer une périostite d'une fracture de stress : ça vaut la visite.`, { jours: shin.painDays }));
  }

  // ── Tendons (Achille) : douleur > 48 h = red flag ─────────────────────────
  const tendon = summarize(input, TENDON);
  const tendonActive = tendon.lastPain !== undefined && diffDays(tendon.lastPain, input.today) <= 1;
  if (tendonActive && (tendon.streak * 24 > TENDON_PAIN_FLAG_HOURS || tendon.current >= PAIN_STOP)) {
    flags.push('tendon');
    raise('stop_course');
    blockAllRunning = true;
    blockHardRunning = true;
    noIncrease = true;
    ex.push(explain('tendon.stop', 'stop', 'Tendon d’Achille : on arrête la course', `Douleur au tendon ${tendon.streak > 2 ? `depuis plus de 48 h` : `à ${tendon.current}/10`}. Un tendon irrité qu'on continue de charger devient une tendinopathie de plusieurs mois. Vélo léger ou natation, et un physio si ça persiste.`));
  } else if (tendonActive) {
    raise('prudence');
    blockHardRunning = true;
    ex.push(explain('tendon.warning', 'attention', 'Tendon sous surveillance', 'Pas de côtes raides ni de vitesse tant que le tendon parle. Si ça dure plus de 48 h, on arrête la course.'));
  }

  // ── Autres zones ──────────────────────────────────────────────────────────
  const others = summarize(input, Object.keys(ZONE_LABEL).filter((z) => !SHIN.includes(z as BodyZone) && !TENDON.includes(z as BodyZone)) as BodyZone[]);
  const otherZone = input.pain.filter((p) => others.zones.includes(p.zone) && p.date === others.lastPain).sort((a, b) => b.intensity - a.intensity)[0]?.zone;
  if (others.lastPain && diffDays(others.lastPain, input.today) <= 1 && others.current >= PAIN_STOP) {
    raise(others.streak >= PAIN_PERSISTENT_DAYS ? 'stop_course' : 'prudence');
    blockHardRunning = true;
    noIncrease = true;
    if (others.streak >= PAIN_PERSISTENT_DAYS) blockAllRunning = true;
    ex.push(explain('pain.other', others.streak >= PAIN_PERSISTENT_DAYS ? 'stop' : 'attention', `Douleur : ${ZONE_LABEL[otherZone!]}`, others.streak >= PAIN_PERSISTENT_DAYS ? 'Douleur marquée qui persiste : pas de course tant que ça ne se calme pas. Croisé sans douleur seulement.' : 'Douleur marquée : facile seulement aujourd’hui, et on surveille demain.', { douleur: others.current }));
  }

  // ── Red flags de charge (bien-être) ───────────────────────────────────────
  const recent = input.wellness.filter((w) => w.date <= input.today && w.date > addDays(input.today, -7)).sort((a, b) => a.date.localeCompare(b.date));
  const last3 = recent.filter((w) => w.date > addDays(input.today, -3));
  if (last3.filter((w) => w.bodyBattery !== undefined && w.bodyBattery < BODY_BATTERY_LOW).length >= BODY_BATTERY_LOW_MORNINGS) {
    flags.push('body_battery');
    ex.push(explain('flag.bodybattery', 'attention', 'Batterie à plat', `Body Battery sous ${BODY_BATTERY_LOW} plusieurs matins : ton corps ne recharge pas. On récupère avant de recharger l'entraînement.`));
  }
  let hrvStreak = 0;
  for (let i = recent.length - 1; i >= 0 && recent[i]!.hrv !== undefined && recent[i]!.hrv !== 'equilibre'; i--) hrvStreak++;
  if (hrvStreak > HRV_BAD_DAYS) {
    flags.push('hrv');
    ex.push(explain('flag.hrv', 'attention', 'VFC basse plusieurs jours', `Ta VFC est basse ou déséquilibrée depuis ${hrvStreak} jours : signe de stress cumulé (entraînement + vie).`, { jours: hrvStreak }));
  }
  const todayW = recent.find((w) => w.date === input.today);
  if (todayW?.hrRest !== undefined && todayW.hrRest >= input.hrRestBaseline + HR_REST_ELEVATION_BPM) {
    flags.push('hr_rest');
    ex.push(explain('flag.hrrest', 'attention', 'FC repos élevée', `FC repos à ${todayW.hrRest} (base ${input.hrRestBaseline}) : fatigue, début de rhume ou mauvaise nuit. Pas de qualité aujourd'hui.`, { fc: todayW.hrRest, base: input.hrRestBaseline }));
  }
  const sick = Boolean(todayW?.sick);
  if (sick) {
    flags.push('sick');
    noQuality = true;
    ex.push(explain('flag.sick', 'attention', 'Malade', 'Rhume ou virus : pas de qualité. Si c’est sous le cou (poitrine, fièvre), pas de course du tout.'));
  }
  const redDays = recent.filter((w) => w.date > addDays(input.today, -5) && w.state === 'rouge').length;
  if (redDays >= 3) {
    flags.push('fatigue');
    ex.push(explain('flag.fatigue', 'attention', 'Fatigue persistante', `${redDays} jours « brûlé » sur 5 : ça ne passera pas en serrant les dents.`, { jours: redDays }));
  }

  // ── Protocole ─────────────────────────────────────────────────────────────
  const loadFlags = flags.filter((f) => f !== 'tendon');
  const symptom = shin.current > 0 || tendon.current > 0 || others.current > 0 || sick;
  let recommendDeload = false;
  if (loadFlags.length > 0 && symptom && !sick) {
    raise('decharge');
    recommendDeload = true;
    noQuality = true;
    ex.push(explain('protocol.deload', 'attention', 'Décharge anticipée', 'Signal de fatigue + douleur : on avance la semaine de décharge. Mieux vaut une semaine légère maintenant que trois semaines arrêté plus tard.'));
  } else if (loadFlags.length >= 2) {
    raise('repos');
    noQuality = true;
    ex.push(explain('protocol.off', 'attention', 'Journée off', `${loadFlags.length} signaux d'alarme : repos complet, ou vélo/natation très facile.`, { signaux: loadFlags.length }));
  } else if (loadFlags.length === 1 && !sick) {
    raise('alleger');
    noQuality = true;
    ex.push(explain('protocol.easy', 'conseil', 'Journée légère', 'Un signal d’alarme : Z2 léger ou repos aujourd’hui.'));
  } else if (sick) {
    raise('alleger');
  }

  // Fatigue parentale cumulée : semaine « maintien ».
  const shortNights = recent.filter((w) => w.shortNight || (w.sleepHours !== undefined && w.sleepHours < SHORT_NIGHT_HOURS)).length;
  const recommendMaintenanceWeek = shortNights >= 4;
  if (recommendMaintenanceWeek) {
    ex.push(explain('protocol.maintenance', 'conseil', 'Semaine maintien suggérée', `${shortNights} nuits courtes sur 7. On passe en semaine maintien (60-70 % du volume, zéro qualité) : on protège la santé sans perdre la forme. Ça reviendra.`, { nuits: shortNights }));
  }

  if (ex.length === 0) ex.push(explain('health.ok', 'info', 'Feu vert', 'Aucun signal d’alarme. Go.'));
  return {
    level, flags, explanations: ex.sort(bySeverity),
    blockHardRunning, blockAllRunning, noIncrease, noQuality: noQuality || blockHardRunning,
    suggestPro, recommendDeload, recommendMaintenanceWeek,
  };
}

/** Feu tricolore pour l'écran Corps. */
export function healthLight(status: HealthStatus): 'vert' | 'jaune' | 'rouge' {
  if (status.level === 'stop_course' || status.level === 'decharge' || status.level === 'repos') return 'rouge';
  if (status.level === 'ok' && !status.recommendMaintenanceWeek) return 'vert';
  return 'jaune';
}
