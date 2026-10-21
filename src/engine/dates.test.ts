import { describe, expect, it } from 'vitest';
import { addDays, dayOfWeek, diffDays, isBetween, mondayOf, toIsoDate, weekday } from './dates';
import { bySeverity, explain, worstSeverity } from './explain';

describe('dates', () => {
  it('additionne les jours à travers les mois, années et changements d’heure', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02'); // fin de l'heure d'été au Québec
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('calcule les écarts', () => {
    expect(diffDays('2026-10-21', '2026-10-25')).toBe(4);
    expect(diffDays('2026-10-25', '2026-10-21')).toBe(-4);
  });
  it('trouve le jour de semaine ISO et le lundi', () => {
    expect(weekday('2026-10-21')).toBe(3); // mercredi
    expect(weekday('2026-10-25')).toBe(7); // dimanche
    expect(mondayOf('2026-10-25')).toBe('2026-10-19');
    expect(mondayOf('2026-10-19')).toBe('2026-10-19');
    expect(dayOfWeek('2026-10-19', 6)).toBe('2026-10-24');
  });
  it('convertit une Date locale', () => {
    expect(toIsoDate(new Date(2026, 9, 5, 23, 30))).toBe('2026-10-05');
  });
  it('teste un intervalle inclusif', () => {
    expect(isBetween('2026-10-21', '2026-10-21', '2026-10-22')).toBe(true);
    expect(isBetween('2026-10-23', '2026-10-21', '2026-10-22')).toBe(false);
  });
});

describe('explications', () => {
  it('construit avec ou sans valeurs', () => {
    expect(explain('r', 'info', 't', 'w')).toEqual({ ruleId: 'r', severity: 'info', title: 't', why: 'w' });
    expect(explain('r', 'stop', 't', 'w', { km: 3 }).values).toEqual({ km: 3 });
  });
  it('trie et trouve la plus grave', () => {
    const list = [explain('a', 'info', '', ''), explain('b', 'stop', '', ''), explain('c', 'conseil', '', '')];
    expect([...list].sort(bySeverity).map((e) => e.ruleId)).toEqual(['b', 'c', 'a']);
    expect(worstSeverity(list)).toBe('stop');
    expect(worstSeverity([])).toBe('info');
  });
});
