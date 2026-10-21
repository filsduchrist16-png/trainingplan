import type { Explanation } from './types';

/** Fabrique d'explications : chaque décision du moteur passe par ici, donc chaque décision a son « Pourquoi? ». */
export function explain(
  ruleId: string,
  severity: Explanation['severity'],
  title: string,
  why: string,
  values?: Explanation['values'],
): Explanation {
  return values ? { ruleId, severity, title, why, values } : { ruleId, severity, title, why };
}

const ORDER: Record<Explanation['severity'], number> = { stop: 3, attention: 2, conseil: 1, info: 0 };

/** Trie du plus grave au moins grave (la sécurité d'abord). */
export function bySeverity(a: Explanation, b: Explanation): number {
  return ORDER[b.severity] - ORDER[a.severity];
}

export function worstSeverity(list: Explanation[]): Explanation['severity'] {
  return list.reduce<Explanation['severity']>((w, e) => (ORDER[e.severity] > ORDER[w] ? e.severity : w), 'info');
}
