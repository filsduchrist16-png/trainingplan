import { HEALTH_RENEW_DAYS } from './constants';
import { diffDays } from './dates';
import { explain } from './explain';
import type { Explanation, HealthProfile, HealthQuestion, ISODate } from './types';

/**
 * Dépistage avant l'exercice, inspiré du PAR-Q+ et de l'algorithme de l'ACSM (questions reformulées).
 * Le questionnaire RESTREINT le plan, jamais l'inverse.
 *
 * - `bloque` : douleur thoracique (Q2), malaise (Q3) ou activité supervisée seulement (Q7), sans autorisation
 *   médicale enregistrée → pas de plan ;
 * - `prudent` : problème cardiaque ou hypertension (Q1), maladie chronique (Q4), ou blocage levé par un médecin ;
 * - `ok` sinon. Q5, Q6, Q8 et Q9 orientent vers des profils (FC non fiable, retour de blessure, grossesse,
 *   marche d'abord), appliqués par les règles de profil.
 */
export type ScreeningLevel = 'ok' | 'prudent' | 'bloque';
export interface Screening {
  level: ScreeningLevel;
  explanations: Explanation[];
}

/** Libellés des questions, reformulés (pas le texte officiel du PAR-Q+). */
export const HEALTH_QUESTIONS: Record<HealthQuestion, string> = {
  q1: "Un médecin t'a déjà parlé d'un problème cardiaque ou d'hypertension?",
  q2: "As-tu des douleurs ou un serrement dans la poitrine, au repos ou à l'effort?",
  q3: "As-tu eu un étourdissement avec perte d'équilibre, ou perdu connaissance, dans les 12 derniers mois?",
  q4: 'As-tu une autre maladie chronique (diabète, asthme, maladie rénale…)?',
  q5: 'Prends-tu un médicament régulier pour une maladie chronique?',
  q6: "As-tu eu un problème d'os, d'articulation, de muscle ou de tendon dans les 12 derniers mois?",
  q7: "Un médecin t'a dit de ne faire que de l'activité supervisée?",
  q8: "Es-tu enceinte, ou as-tu accouché dans les 12 derniers mois?",
  q9: "Peux-tu marcher 30 min d'un bon pas sans gêne?",
};

const BLOCKING: HealthQuestion[] = ['q2', 'q3', 'q7'];

export function screen(health: HealthProfile | undefined, today: ISODate): Screening {
  if (!health) {
    return { level: 'ok', explanations: [explain('health.missing', 'conseil', 'Questionnaire santé à remplir', "Quelques questions oui/non avant de courir : elles adaptent le plan à ta santé. Rien ne quitte ton appareil.")] };
  }
  const a = health.answers;
  const explanations: Explanation[] = [];
  const blockers = BLOCKING.filter((q) => a[q]);
  const cleared = health.clearance !== undefined && health.clearance >= health.answeredAt;
  let level: ScreeningLevel = 'ok';

  if (blockers.length) {
    if (cleared) {
      level = 'prudent';
      explanations.push(explain('health.cleared', 'conseil', 'Autorisation médicale enregistrée', `Un médecin te permet de courir (autorisation du ${health.clearance}). Le plan reste prudent : on monte doucement, et tu arrêtes au moindre symptôme.`, { date: health.clearance! }));
    } else {
      level = 'bloque';
      explanations.push(explain('health.clearance', 'stop', 'Un avis médical avant de commencer', `Tu as répondu oui à ${blockers.map((q) => q.toUpperCase()).join(', ')} : ${blockers.map((q) => HEALTH_QUESTIONS[q].replace(/\?$/, '').toLowerCase()).join(' ; ')}. Ça mérite un avis médical avant de courir. Quand un médecin t'autorise, coche « Un médecin m'autorise » : ton plan sera créé, en mode prudent.`, { questions: blockers.join(',') }));
    }
  }
  if (a.q1) {
    if (level === 'ok') level = 'prudent';
    explanations.push(explain('health.cardio', 'attention', 'Cœur ou tension : plan prudent', "Problème cardiaque ou hypertension : on te conseille fortement d'en parler à ton médecin avant de commencer. Le plan est prudent : pas d'intensité au-dessus de Z2 les 4 premières semaines, pas de test à fond.", { question: 'q1' }));
  }
  if (a.q4) {
    if (level === 'ok') level = 'prudent';
    explanations.push(explain('health.chronic', 'attention', 'Maladie chronique : plan prudent', `Maladie chronique déclarée${health.conditions.length ? ` (${health.conditions.join(', ')})` : ''} : plan prudent, et des conseils adaptés sur tes séances. Ton médecin reste la référence.`, { question: 'q4' }));
  }
  if (a.q5 && health.hrUnreliable) {
    explanations.push(explain('health.hr_unreliable', 'conseil', 'Zones à l’effort perçu', 'Ton médicament modifie ta fréquence cardiaque : tes zones se règlent à l’effort perçu (RPE) et au test de la parole, pas au cardio.', { question: 'q5' }));
  }
  if (a.q6) {
    explanations.push(explain('health.injury', 'conseil', 'Retour de blessure', 'Blessure dans les 12 derniers mois : le plan monte plus lentement, et on surveille la zone.', { question: 'q6' }));
  }
  if (a.q8) {
    explanations.push(explain('health.pregnancy', 'attention', health.pregnancy?.status === 'post_partum' ? 'Post-partum' : 'Grossesse', 'Des règles adaptées s’appliquent (pas d’objectif de course pendant la grossesse, reprise progressive après l’accouchement). Valide toujours avec ton suivi de grossesse.', { question: 'q8' }));
  }
  if (!a.q9) {
    explanations.push(explain('health.walk_first', 'conseil', 'On commence par marcher', 'Marcher 30 min d’un bon pas, c’est la première étape : on y va en marche rapide, puis la course arrive par petits intervalles.', { question: 'q9' }));
  }
  const age = diffDays(health.answeredAt, today);
  if (age >= HEALTH_RENEW_DAYS) {
    explanations.push(explain('health.renew', 'conseil', 'Questionnaire santé à refaire', `Tes réponses datent de ${Math.floor(age / 30)} mois : un an a passé, prends 1 min pour les mettre à jour.`, { jours: age }));
  }
  return { level, explanations };
}
