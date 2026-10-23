import { describe, expect, it } from 'vitest';
import { EXERCISES, nextTarget, strengthProgram, tempoSteps } from './strength';

const ids = (p: ReturnType<typeof strengthProgram>) => p.rows.map((r) => r.exerciseId);

describe('programme de muscu', () => {
  it('chaque exercice du programme existe dans le catalogue', () => {
    for (const type of ['muscu_generale', 'muscu_trail', 'plyo'] as const) {
      for (const phase of ['base', 'spec1', 'spec2', 'precomp', 'taper', 'recup'] as const) {
        for (const r of strengthProgram({ type, phase, experience: 'avance', trail: true, balance: true, pregnancy: false }).rows) expect(EXERCISES[r.exerciseId], r.exerciseId).toBeDefined();
      }
    }
    for (const e of Object.values(EXERCISES)) expect(e.cues.length).toBeGreaterThan(0);
  });

  it('fondation (base) : 8-12 reps, tempo lent, repos courts ; force (spec) : 5-8 reps, repos longs ; maintien (affûtage) : peu de séries', () => {
    const base = strengthProgram({ type: 'muscu_generale', phase: 'base', experience: 'regulier' });
    expect(base.scheme).toBe('fondation');
    expect(base.rows[0]).toMatchObject({ exerciseId: 'goblet', sets: 3, repsMin: 8, repsMax: 12, tempo: '3-1-1', restSec: 60 });
    const force = strengthProgram({ type: 'muscu_generale', phase: 'spec1', experience: 'avance' });
    expect(force.scheme).toBe('force');
    expect(force.rows[0]).toMatchObject({ sets: 3, repsMin: 5, repsMax: 8, restSec: 120 });
    expect(force.rpeTarget).toBe(8);
    const taper = strengthProgram({ type: 'muscu_generale', phase: 'taper', experience: 'avance' });
    expect(taper.scheme).toBe('maintien');
    expect(taper.rows[0]!.sets).toBe(2);
    expect(taper.rpeTarget).toBe(6);
    expect(strengthProgram({ type: 'muscu_generale', phase: 'demarrage', experience: 'jamais' }).scheme).toBe('fondation');
  });

  it('débutant : fourchettes hautes même en phase de force, au plus 3 séries', () => {
    const p = strengthProgram({ type: 'muscu_generale', phase: 'spec2', experience: 'debutant' });
    expect(p.rows[0]).toMatchObject({ repsMin: 8, repsMax: 12 });
    expect(Math.max(...p.rows.map((r) => r.sets))).toBeLessThanOrEqual(3);
    expect(p.explanation.why).toMatch(/3 séries/);
    expect(strengthProgram({ type: 'muscu_generale', phase: 'spec2', experience: 'avance' }).explanation.why).not.toMatch(/3 séries/);
  });

  it('trail : descentes excentriques ; 65+ : équilibre ; grossesse : pas de planche', () => {
    expect(ids(strengthProgram({ type: 'muscu_trail', phase: 'spec1', experience: 'regulier', trail: true }))).toContain('stepdown');
    expect(ids(strengthProgram({ type: 'muscu_generale', phase: 'base', experience: 'regulier' }))).not.toContain('stepdown');
    expect(ids(strengthProgram({ type: 'muscu_generale', phase: 'base', experience: 'regulier', balance: true }))).toContain('balance');
    const preg = ids(strengthProgram({ type: 'muscu_generale', phase: 'base', experience: 'regulier', pregnancy: true }));
    expect(preg).toContain('birddog');
    expect(preg).not.toContain('plank');
    expect(strengthProgram({ type: 'muscu_trail', phase: 'spec1', experience: 'regulier', trail: true }).name).toBe('Muscu trail');
  });

  it('pliométrie : seulement pour qui a de la base, jamais pendant la grossesse', () => {
    expect(ids(strengthProgram({ type: 'plyo', phase: 'spec1', experience: 'avance' }))).toEqual(['pogo', 'squatjump', 'bound']);
    for (const input of [{ experience: 'debutant' as const }, { experience: 'avance' as const, pregnancy: true }]) {
      const p = strengthProgram({ type: 'plyo', phase: 'spec1', ...input });
      expect(p.rows).toEqual([]);
      expect(p.explanation.ruleId).toBe('strength.plyo.skip');
    }
    expect(strengthProgram({ type: 'plyo', phase: 'spec1', experience: 'jamais' }).explanation.why).toMatch(/base/);
  });
});

describe('double progression', () => {
  const range = { repsMin: 8, repsMax: 12 };
  it('première fois : bas de la fourchette, léger', () => {
    expect(nextTarget([], range)).toMatchObject({ reps: 8, explanation: { ruleId: 'strength.first' } });
  });
  it('toutes les séries au haut de la fourchette, effort sous 9 → +2,5 kg et retour au bas', () => {
    const t = nextTarget([{ reps: 12, loadKg: 20, rpe: 7 }, { reps: 12, loadKg: 20, rpe: 8 }, { reps: 13, loadKg: 20 }], range);
    expect(t).toMatchObject({ reps: 8, loadKg: 22.5, explanation: { ruleId: 'strength.load' } });
  });
  it('reps atteintes mais effort 9-10 : on consolide', () => {
    const t = nextTarget([{ reps: 12, loadKg: 20, rpe: 9 }, { reps: 12, loadKg: 20, rpe: 9 }], range);
    expect(t).toMatchObject({ reps: 12, loadKg: 20, explanation: { ruleId: 'strength.hold' } });
  });
  it('une série sous le bas : même charge, retour à 8', () => {
    expect(nextTarget([{ reps: 8, loadKg: 20 }, { reps: 6, loadKg: 20 }], range)).toMatchObject({ reps: 8, loadKg: 20, explanation: { ruleId: 'strength.back' } });
  });
  it('sinon +1 rep sur la plus faible, sans dépasser le haut', () => {
    expect(nextTarget([{ reps: 10, loadKg: 20 }, { reps: 9, loadKg: 20 }], range)).toMatchObject({ reps: 10, loadKg: 20, explanation: { ruleId: 'strength.reps' } });
    expect(nextTarget([{ reps: 12, loadKg: 20, rpe: 9 }, { reps: 11, loadKg: 20 }], range)).toMatchObject({ reps: 12 });
  });
  it('poids du corps : au haut de la fourchette, on propose une charge ou une variante', () => {
    expect(nextTarget([{ reps: 12 }, { reps: 12 }], range, { loaded: true })).toMatchObject({ reps: 12, explanation: { ruleId: 'strength.addload', why: expect.stringContaining('haltère') } });
    expect(nextTarget([{ reps: 12 }], range, { loaded: false }).explanation.why).toMatch(/tempo/);
    expect(nextTarget([{ reps: 9 }], range).loadKg).toBeUndefined();
  });
  it('tempo guidé', () => {
    expect(tempoSteps('3-1-1')).toEqual([{ label: 'Descends', sec: 3 }, { label: 'Pause', sec: 1 }, { label: 'Monte', sec: 1 }]);
    expect(tempoSteps('4')).toEqual([{ label: 'Descends', sec: 4 }, { label: 'Pause', sec: 1 }, { label: 'Monte', sec: 1 }]);
  });
});
