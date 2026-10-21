import { describe, expect, it } from 'vitest';
import { runWalk, type BuildContext } from './builders';
import {
  JOURNEY_DONE, LADDER_LAST, STAGE_WALK, TRANSITION_LAST, continuousMinutes, stageDurationMinutes, stageKind, stageLabel,
  stageRunMinutes, stageWalkMinutes, walkFirstMinutes,
} from './runwalk';

const ctx: BuildContext = { goal: 'route_5k', trail: false, phaseWeek: 0 };
const ladder = Array.from({ length: LADDER_LAST }, (_, i) => i + 1);

describe('T1 — échelle de marche/course en minutes', () => {
  it('chaque palier dure entre 30 et 45 min, échauffement et retour au calme marchés inclus', () => {
    for (const p of ladder) {
      const d = stageDurationMinutes(p);
      expect(d, `palier ${p}`).toBeGreaterThanOrEqual(30);
      expect(d, `palier ${p}`).toBeLessThanOrEqual(45);
      expect(runWalk(p, ctx).durationMin).toBe(d);
    }
  });
  it('le temps de course total ne monte jamais de plus de 25 % d’un palier au suivant', () => {
    for (let p = 2; p <= TRANSITION_LAST; p++) {
      expect(stageRunMinutes(p) / stageRunMinutes(p - 1), `palier ${p - 1} → ${p}`).toBeLessThanOrEqual(1.25 + 1e-9);
    }
  });
  it('reprend le tableau de la spécification (course totale 7 → 30 min)', () => {
    expect(ladder.map(stageRunMinutes)).toEqual([7, 8, 10, 12, 14, 15, 16, 20, 21, 20, 24, 30, 20]);
  });
  it('le palier 13 est continu, sans marche entre les intervalles', () => {
    const s = runWalk(LADDER_LAST, ctx);
    expect(stageKind(LADDER_LAST)).toBe('continu');
    expect(stageWalkMinutes(LADDER_LAST)).toBe(0);
    expect(s.title).toBe('Course continue 20 min');
    expect(s.steps.map((x) => x.kind)).toEqual(['echauffement', 'continu', 'retour_calme']);
  });
  it('séance = 5 min de marche rapide + bloc + 5 min de marche lente', () => {
    const s = runWalk(2, ctx);
    expect(s.steps[0]).toMatchObject({ kind: 'echauffement', minutes: 5 });
    expect(s.steps[1]).toMatchObject({ kind: 'effort', seconds: 60, repeat: 8, recoverySeconds: 90, recoveryWalk: true });
    expect(s.steps[2]).toMatchObject({ kind: 'retour_calme', minutes: 5 });
    expect(s.title).toBe('Marche-course 8 × (1 min course / 1 min 30 marche)');
  });
  it('transition continue : 22 → 30 min', () => {
    expect([14, 15, 16, 17, 18].map(continuousMinutes)).toEqual([22, 24, 26, 28, 30]);
    expect(runWalk(18, ctx).title).toBe('Course continue 30 min');
    expect(runWalk(99, ctx).title).toBe('Course continue 30 min'); // borné à la fin de la transition
  });
  it('marche d’abord : 20 → 30 min, +5 min par séance validée', () => {
    expect([0, 1, 2, 3, 9].map(walkFirstMinutes)).toEqual([20, 25, 30, 30, 30]);
    const s = runWalk(STAGE_WALK, ctx, { walkMin: 25 });
    expect(s.title).toBe('Marche rapide 25 min');
    expect(s.distanceKm).toBeCloseTo(25 / 11, 1);
    expect(runWalk(STAGE_WALK, ctx).durationMin).toBe(20);
    expect(stageRunMinutes(STAGE_WALK)).toBe(0);
    expect(stageDurationMinutes(STAGE_WALK, 30)).toBe(30);
  });
  it('jour de la longue : 10 min de marche en plus, dans le retour au calme', () => {
    const s = runWalk(5, ctx, { extraWalkMin: 10 });
    expect(s.durationMin).toBe(stageDurationMinutes(5) + 10);
    expect(s.steps[2]!.minutes).toBe(15);
    expect(runWalk(STAGE_WALK, ctx, { walkMin: 30, extraWalkMin: 10 }).durationMin).toBe(40);
    expect(runWalk(13, ctx, { extraWalkMin: 10 }).steps[2]!.note).toMatch(/10 min de marche en plus/);
  });
  it('km estimés : course à l’allure facile, marche à 11 min/km', () => {
    const s = runWalk(1, ctx); // 7 min course @ 7 min/km + 24 min marche @ 11 min/km
    expect(s.distanceKm).toBeCloseTo(1 + 24 / 11, 1);
  });
  it('libellés', () => {
    expect(stageLabel(0)).toBe("Marche d'abord");
    expect(stageLabel(5)).toBe('Palier 5 sur 13');
    expect(stageLabel(16)).toBe('Transition : 26 min continues');
    expect(stageLabel(JOURNEY_DONE)).toBe('Parcours terminé');
    expect(stageKind(JOURNEY_DONE)).toBe('termine');
    expect(stageRunMinutes(JOURNEY_DONE)).toBe(30);
  });
});
