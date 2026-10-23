import { describe, expect, it } from 'vitest';
import { screen, HEALTH_QUESTIONS } from './screening';
import type { HealthProfile, HealthQuestion } from './types';

const TODAY = '2026-10-21';
const none: Record<HealthQuestion, boolean> = { q1: false, q2: false, q3: false, q4: false, q5: false, q6: false, q7: false, q8: false, q9: true };
const h = (yes: Partial<Record<HealthQuestion, boolean>>, over: Partial<HealthProfile> = {}): HealthProfile => ({ answers: { ...none, ...yes }, answeredAt: '2026-10-01', conditions: [], ...over });
const ids = (s: ReturnType<typeof screen>) => s.explanations.map((e) => e.ruleId);

describe('dépistage santé (T8)', () => {
  it('sans questionnaire : ok, mais on invite à le remplir', () => {
    expect(screen(undefined, TODAY)).toMatchObject({ level: 'ok' });
    expect(ids(screen(undefined, TODAY))).toEqual(['health.missing']);
  });
  it('tout va bien : ok, aucune explication', () => {
    expect(screen(h({}), TODAY)).toEqual({ level: 'ok', explanations: [] });
  });
  it('Q1 cœur ou tension : prudent + conseil de consulter', () => {
    const s = screen(h({ q1: true }), TODAY);
    expect(s.level).toBe('prudent');
    expect(s.explanations[0]!.why).toMatch(/médecin/);
  });
  it.each(['q2', 'q3', 'q7'] as HealthQuestion[])('%s : blocage tant qu’un médecin n’autorise pas', (q) => {
    const s = screen(h({ [q]: true }), TODAY);
    expect(s.level).toBe('bloque');
    const e = s.explanations.find((x) => x.ruleId === 'health.clearance')!;
    expect(e.severity).toBe('stop');
    expect(e.why).toContain(q.toUpperCase());
    expect(e.why).toContain('Un médecin m\'autorise');
  });
  it('blocage levé par « Un médecin m’autorise » : plan prudent', () => {
    const s = screen(h({ q2: true, q3: true }, { clearance: '2026-10-05' }), TODAY);
    expect(s.level).toBe('prudent');
    expect(ids(s)).toEqual(['health.cleared']);
  });
  it('autorisation antérieure aux réponses : ne compte pas (une réponse a changé)', () => {
    expect(screen(h({ q7: true }, { clearance: '2026-09-01' }), TODAY).level).toBe('bloque');
  });
  it('Q4 maladie chronique : prudent, maladies nommées', () => {
    const s = screen(h({ q4: true }, { conditions: ['diabete', 'asthme'] }), TODAY);
    expect(s.level).toBe('prudent');
    expect(s.explanations[0]!.why).toContain('diabete, asthme');
    expect(screen(h({ q4: true }), TODAY).explanations[0]!.why).not.toContain('(');
  });
  it('Q1 et Q4 : prudent, deux explications', () => {
    expect(ids(screen(h({ q1: true, q4: true }), TODAY))).toEqual(['health.cardio', 'health.chronic']);
  });
  it('Q5 médicament qui modifie la FC : zones au RPE ; sinon rien', () => {
    expect(ids(screen(h({ q5: true }, { hrUnreliable: true }), TODAY))).toEqual(['health.hr_unreliable']);
    expect(screen(h({ q5: true }), TODAY)).toEqual({ level: 'ok', explanations: [] });
  });
  it('Q6 blessure récente : profil retour de blessure', () => {
    expect(ids(screen(h({ q6: true }), TODAY))).toEqual(['health.injury']);
  });
  it('Q8 grossesse ou post-partum', () => {
    expect(screen(h({ q8: true }, { pregnancy: { status: 'enceinte', dueOrBirthDate: '2027-02-01' } }), TODAY).explanations[0]!.title).toBe('Grossesse');
    expect(screen(h({ q8: true }), TODAY).explanations[0]!.title).toBe('Grossesse');
    expect(screen(h({ q8: true }, { pregnancy: { status: 'post_partum', dueOrBirthDate: '2026-06-01' } }), TODAY).explanations[0]!.title).toBe('Post-partum');
  });
  it('Q9 ne marche pas 30 min : marche d’abord', () => {
    expect(ids(screen(h({ q9: false }), TODAY))).toEqual(['health.walk_first']);
  });
  it('blocage + Q1 : reste bloqué, les deux explications', () => {
    const s = screen(h({ q2: true, q1: true }), TODAY);
    expect(s.level).toBe('bloque');
    expect(ids(s)).toEqual(['health.clearance', 'health.cardio']);
  });
  it('questionnaire de plus de 12 mois : à refaire', () => {
    expect(ids(screen(h({}, { answeredAt: '2025-10-01' }), TODAY))).toEqual(['health.renew']);
  });
  it('9 questions reformulées', () => {
    expect(Object.keys(HEALTH_QUESTIONS)).toHaveLength(9);
  });
});
