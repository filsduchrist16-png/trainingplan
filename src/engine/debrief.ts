import { CARDIAC_DRIFT_OK, EASY_OUT_OF_ZONE_TOLERANCE, GREY_ZONE_TOLERANCE } from './constants';
import { explain } from './explain';
import { SESSION_LIBRARY } from './library';
import { greyZone, timeInZones } from './zones';
import type { ActivitySamples, Explanation, SessionType, Step, ZoneBounds } from './types';

/**
 * Debrief post-séance, par règles (pas de boîte noire) :
 * dans la cible ou non, % de temps par zone vs prévu, zone grise, dérive cardiaque, dérive Z2 → Z3 en fin de longue,
 * cadence vs cible. Puis un ajustement proposé pour la suite, toujours justifié.
 */

export interface DebriefInput {
  activity: {
    durationSec: number;
    distanceKm: number;
    elevationGainM: number;
    hrAvg?: number;
    cadenceAvg?: number;
    timeInZonesSec?: [number, number, number, number, number];
    samples?: ActivitySamples;
  };
  planned?: { type: SessionType; durationMin: number; steps: Step[]; isKey: boolean };
  bounds: ZoneBounds;
  hrMax: number;
  cadenceTarget: [number, number];
}

export interface Debrief {
  summary: string[];
  findings: Explanation[];
  adjustments: Explanation[];
  metrics: {
    zoneShare?: [number, number, number, number, number];
    greyShare?: number;
    drift?: number;
    paceMinPerKm?: number;
  };
}

const EASY_TYPES: SessionType[] = ['z1_recup', 'z2_endurance', 'longue_facile', 'marche_course', 'descentes', 'back_to_back', 'strides', 'hill_sprints'];
/** Les séances avec de courts efforts intenses tolèrent plus de temps hors Z2. */
const SHORT_BURST_TYPES: SessionType[] = ['strides', 'hill_sprints'];
const LONG_TYPES: SessionType[] = ['longue_facile', 'longue_specifique', 'back_to_back'];
/** Au-delà de ce dénivelé (m/km), la dérive cardiaque n'est pas interprétable (la pente domine). */
const DRIFT_MAX_GAIN_PER_KM = 25;
/** Échauffement exclu du calcul de dérive (s). */
const DRIFT_WARMUP_SEC = 600;
const DRIFT_MIN_DURATION_SEC = 40 * 60;

const pct = (x: number) => Math.round(x * 100);

/**
 * Découplage FC/allure (Pa:Hr) : on compare l'efficience (vitesse ÷ FC) de la 1re et de la 2e moitié.
 * < 5 % = l'endurance aérobie tient sur la durée.
 */
export function cardiacDrift(samples: ActivitySamples): number | null {
  const { t, hr, speed } = samples;
  if (!hr || !speed) return null;
  const idx = t.map((_, i) => i).filter((i) => t[i]! >= DRIFT_WARMUP_SEC && hr[i] != null && speed[i] != null && speed[i]! > 0.5);
  if (idx.length < 20) return null;
  const half = Math.floor(idx.length / 2);
  const ef = (ids: number[]) => ids.reduce((s, i) => s + speed[i]!, 0) / ids.reduce((s, i) => s + hr[i]!, 0);
  const first = ef(idx.slice(0, half));
  const second = ef(idx.slice(half));
  return Math.round(((first - second) / first) * 1000) / 1000;
}

function share(samples: ActivitySamples, from: number, to: number, pred: (hr: number) => boolean): number {
  const { t, hr } = samples;
  let inside = 0;
  let total = 0;
  for (let i = 0; i < t.length - 1; i++) {
    if (t[i]! < from || t[i]! >= to || hr![i] == null) continue;
    const dt = t[i + 1]! - t[i]!;
    total += dt;
    if (pred(hr![i]!)) inside += dt;
  }
  return total ? inside / total : 0;
}

export function debrief(input: DebriefInput): Debrief {
  const { activity: a, planned, bounds } = input;
  const findings: Explanation[] = [];
  const adjustments: Explanation[] = [];
  const metrics: Debrief['metrics'] = {};
  const summary: string[] = [];
  const type = planned?.type;
  const easy = type ? EASY_TYPES.includes(type) : false;

  const paceMinPerKm = a.distanceKm > 0 ? a.durationSec / 60 / a.distanceKm : undefined;
  if (paceMinPerKm) metrics.paceMinPerKm = Math.round(paceMinPerKm * 100) / 100;
  const tiz = a.timeInZonesSec ?? (a.samples?.hr ? timeInZones(a.samples, bounds) : undefined);
  const tizTotal = tiz?.reduce((s, x) => s + x, 0) ?? 0;

  const label = type ? SESSION_LIBRARY[type].label : 'Sortie';
  const hm = Math.round(a.durationSec / 60);
  summary.push(`${label} : ${a.distanceKm.toFixed(1)} km en ${hm} min${a.elevationGainM ? `, ${Math.round(a.elevationGainM)} m D+` : ''}.`);

  if (!tiz || tizTotal === 0) {
    findings.push(explain('debrief.nohr', 'info', 'Pas de données cardio', 'Sans FC, je ne peux pas juger l’intensité. Note ton RPE : c’est mieux que rien, et c’est honnête.'));
  } else {
    const zs = tiz.map((x) => x / tizTotal) as [number, number, number, number, number];
    metrics.zoneShare = zs;
    const low = zs[0] + zs[1];
    const high = zs[3] + zs[4];
    if (easy) {
      const tolerance = SHORT_BURST_TYPES.includes(type!) ? EASY_OUT_OF_ZONE_TOLERANCE + 0.1 : EASY_OUT_OF_ZONE_TOLERANCE;
      if (1 - low > tolerance) {
        findings.push(explain('debrief.easy.toohard', 'conseil', 'Facile… pas si facile', `${pct(1 - low)} % du temps au-dessus de Z2 sur une séance facile. Les séances faciles trop dures fatiguent sans faire progresser l'endurance.`, { horsZone: pct(1 - low) }));
        adjustments.push(explain('adjust.cap', 'conseil', `Plafonne à ${bounds[1]} bpm`, `Prochaine sortie facile : alarme à ${bounds[1]} bpm, et marche les montées raides. C'est normal d'être lent en Z2 ; c'est là que ça se construit.`, { plafond: bounds[1] }));
      } else {
        findings.push(explain('debrief.easy.ok', 'info', 'Dans la cible', `${pct(low)} % du temps en Z1-Z2. Exactement ce qu'on voulait.`, { cible: pct(low) }));
      }
    } else if (planned?.isKey) {
      const expectedHard = planned.steps.filter((s) => s.kind === 'effort').reduce((s, st) => s + ((st.minutes ?? 0) * 60 + (st.seconds ?? 0)) * (st.repeat ?? 1), 0);
      const hardSec = tiz[2]! + tiz[3]! + tiz[4]!;
      if (expectedHard > 0 && hardSec < expectedHard * 0.5) {
        findings.push(explain('debrief.quality.low', 'info', 'Intensité sous la cible', `Environ ${Math.round(hardSec / 60)} min en Z3+ pour ${Math.round(expectedHard / 60)} min d'effort prévu. Mauvaise journée, terrain, ou FC qui monte lentement sur les courts efforts : ça arrive.`));
        adjustments.push(explain('adjust.quality.retry', 'info', 'On ne change rien pour l’instant', 'Une séance ratée ne dit rien. Si ça se répète 3 fois, on ajustera les allures.'));
      } else {
        findings.push(explain('debrief.quality.ok', 'info', 'Séance qualité faite', `${pct(high)} % en Z4-Z5. Le stimulus est là ; maintenant, récupère.`));
      }
    }

    if (a.samples?.hr && easy) {
      const [lo, hi] = greyZone(input.hrMax);
      const grey = share(a.samples, 0, Infinity, (h) => h >= lo && h <= hi);
      metrics.greyShare = Math.round(grey * 100) / 100;
      if (grey > GREY_ZONE_TOLERANCE) {
        findings.push(explain('debrief.greyzone', 'conseil', 'Zone grise', `${pct(grey)} % du temps entre ${lo} et ${hi} bpm : trop dur pour récupérer, trop facile pour progresser. Le piège classique.`, { part: pct(grey), bas: lo, haut: hi }));
      }
    }

    if (a.samples?.hr && type && LONG_TYPES.includes(type)) {
      const end = a.samples.t.at(-1)!;
      const firstHalf = share(a.samples, 0, end / 2, (h) => h >= bounds[1]);
      const lastQuarter = share(a.samples, end * 0.75, Infinity, (h) => h >= bounds[1]);
      if (lastQuarter > 0.3 && lastQuarter > firstHalf + 0.2) {
        findings.push(explain('debrief.longdrift', 'conseil', 'Dérive Z2 → Z3 en fin de longue', `${pct(lastQuarter)} % du dernier quart en Z3+ contre ${pct(firstHalf)} % en début de sortie. Départ trop rapide, chaleur, ou réservoir vide.`));
        adjustments.push(explain('adjust.long', 'conseil', 'Prochaine longue', 'Pars 10-15 s/km plus lent et mange plus tôt (30-60 g de glucides par heure dès 45 min).'));
      }
    }
  }

  // Dérive cardiaque (sur terrain roulant seulement).
  if (a.samples && a.durationSec >= DRIFT_MIN_DURATION_SEC && a.elevationGainM / Math.max(a.distanceKm, 0.1) <= DRIFT_MAX_GAIN_PER_KM) {
    const drift = cardiacDrift(a.samples);
    if (drift !== null) {
      metrics.drift = drift;
      if (drift <= CARDIAC_DRIFT_OK) findings.push(explain('debrief.drift.ok', 'info', 'Endurance qui tient', `Dérive cardiaque de ${pct(drift)} % : ta FC est restée stable pour la même allure. Signe d'une bonne base aérobie.`, { derive: pct(drift) }));
      else {
        findings.push(explain('debrief.drift.high', 'conseil', 'Dérive cardiaque', `Ta FC a dérivé de ${pct(drift)} % pour la même allure en 2e moitié (cible < ${pct(CARDIAC_DRIFT_OK)} %). Chaleur, hydratation, ou durée encore un peu au-dessus de ta base actuelle.`, { derive: pct(drift) }));
        adjustments.push(explain('adjust.drift', 'conseil', 'Hydrate-toi et ralentis un brin', 'Bois régulièrement et commence plus lentement. Quand la dérive passera sous 5 % sur cette durée, on pourra allonger.'));
      }
    }
  }

  // Cadence.
  if (a.cadenceAvg && (!type || !['marche_course', 'cotes_longues', 'descentes'].includes(type))) {
    const [lo, hi] = input.cadenceTarget;
    if (a.cadenceAvg < lo - 3) {
      findings.push(explain('debrief.cadence.low', 'conseil', 'Cadence basse', `${Math.round(a.cadenceAvg)} pas/min (cible ${lo}-${hi}). Une cadence un peu plus haute réduit l'impact par foulée, ce qui ménage les tibias.`, { cadence: Math.round(a.cadenceAvg), cible: lo }));
      adjustments.push(explain('adjust.cadence', 'info', 'Cadence : +2-3 pas/min à la fois', 'Pense « pieds rapides, pas courts » pendant les strides et les côtes courtes. Progression graduelle, pas un changement brutal.'));
    } else if (a.cadenceAvg >= lo) {
      findings.push(explain('debrief.cadence.ok', 'info', 'Cadence dans la cible', `${Math.round(a.cadenceAvg)} pas/min.`));
    }
  }

  // Durée vs prévu (sans culpabiliser).
  if (planned && planned.durationMin > 0) {
    const ratio = a.durationSec / 60 / planned.durationMin;
    if (ratio < 0.8) findings.push(explain('debrief.short', 'info', 'Plus court que prévu', 'Pas grave : une séance raccourcie vaut mieux qu’une séance sautée. On continue le plan normalement.'));
    else if (ratio > 1.2) {
      findings.push(explain('debrief.long', 'conseil', 'Plus long que prévu', `${pct(ratio - 1)} % de plus que prévu. Garde la prochaine séance facile pour absorber.`));
      adjustments.push(explain('adjust.absorb', 'conseil', 'Demain : facile', 'Le surplus de volume se paie en récupération : prochaine sortie en Z1/Z2.'));
    }
  }

  for (const f of findings.filter((x) => x.ruleId !== 'debrief.cadence.ok').slice(0, 3)) summary.push(`${f.title}.`);
  return { summary, findings, adjustments, metrics };
}
