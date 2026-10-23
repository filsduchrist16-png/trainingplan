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

import { addDays } from './dates';
import { initialRunWalkState, nextRunWalkState, projectStages, sessionsToReach, validationsRequired, type RunWalkSession } from './runwalk';

const D0 = '2026-11-02';
const ok = (d: number): RunWalkSession => ({ date: addDays(D0, d), completed: true, rpe: 4 });
const run = (sessions: RunWalkSession[], start = initialRunWalkState(5), pain: { date: string; intensity: number }[] = [], opts = {}, today?: string) =>
  nextRunWalkState(start, sessions, pain, today ?? sessions.at(-1)?.date ?? D0, opts);
const ids = (r: ReturnType<typeof run>) => r.explanations.map((e) => e.ruleId);

describe('T2 — règle de validation', () => {
  it('2 séances validées de suite → palier suivant', () => {
    const r = run([ok(0), ok(2)]);
    expect(r.state).toMatchObject({ stage: 6, validatedAtStage: 0 });
    expect(ids(r)).toEqual(['runwalk.validated', 'runwalk.advance']);
  });
  it('séance faite mais RPE 6-7 → on répète (et la série repart)', () => {
    const r = run([ok(0), { date: addDays(D0, 2), completed: true, rpe: 7 }, ok(4)]);
    expect(r.state).toMatchObject({ stage: 5, validatedAtStage: 1 });
    expect(ids(r)[1]).toBe('runwalk.repeat');
  });
  it('non terminée ou RPE ≥ 8 → on répète ; 2 échecs de suite → un palier plus bas', () => {
    const one = run([{ date: D0, completed: false, rpe: 5 }]);
    expect(one.state).toMatchObject({ stage: 5, failsAtStage: 1 });
    const two = run([{ date: D0, completed: true, rpe: 8 }, { date: addDays(D0, 2), completed: false }]);
    expect(two.state).toMatchObject({ stage: 4, failsAtStage: 0 });
    expect(ids(two)).toEqual(['runwalk.repeat', 'runwalk.back']);
  });
  it('douleur 1-2 (le jour même ou le lendemain) → on répète, pas d’avancement', () => {
    const r = run([ok(0), ok(2)], undefined, [{ date: addDays(D0, 3), intensity: 2 }]);
    expect(r.state).toMatchObject({ stage: 5, validatedAtStage: 0 });
    expect(r.explanations[1]!.why).toMatch(/2\/10/);
  });
  it('douleur ≥ 3 ou garde-fou actif → un palier plus bas', () => {
    expect(run([ok(0)], undefined, [{ date: D0, intensity: 4 }]).state.stage).toBe(4);
    const g = run([ok(0)], undefined, [], { healthBlocked: true });
    expect(g.state.stage).toBe(4);
    expect(g.explanations[0]!.why).toMatch(/garde-fou/);
  });
  it('une douleur deux jours plus tard ne compte pas pour la séance', () => {
    expect(run([ok(0), ok(2)], undefined, [{ date: addDays(D0, 5), intensity: 5 }]).state.stage).toBe(6);
  });
  it('7 à 13 jours sans séance → on répète le dernier palier validé', () => {
    const r = run([ok(0), ok(9)]);
    expect(r.state).toMatchObject({ stage: 5, validatedAtStage: 1 });
    expect(ids(r)).toEqual(['runwalk.validated', 'runwalk.gap', 'runwalk.validated']);
  });
  it('14 à 27 jours → on recule de 2 paliers (jamais sous le palier 1)', () => {
    expect(run([ok(0), ok(20)]).state.stage).toBe(3);
    expect(run([ok(0), ok(20)], initialRunWalkState(2)).state.stage).toBe(1);
  });
  it('28 jours et plus → point d’entrée recalculé (palier 1 par défaut, jamais plus haut qu’avant)', () => {
    const r = run([ok(0), ok(40)], initialRunWalkState(9), [], { entryStage: 4 });
    expect(r.state.stage).toBe(4);
    expect(ids(r)).toContain('runwalk.restart');
    expect(run([ok(0), ok(40)], initialRunWalkState(9)).state.stage).toBe(1);
    expect(run([ok(0), ok(40)], initialRunWalkState(3), [], { entryStage: 8 }).state.stage).toBe(3);
  });
  it('profil lent : 3 séances validées par palier', () => {
    expect(run([ok(0), ok(2)], undefined, [], { slow: true }).state.stage).toBe(5);
    expect(run([ok(0), ok(2), ok(4)], undefined, [], { slow: true }).state.stage).toBe(6);
  });
  it('2 jours par semaine : 12 séances validées → 6 paliers, quel que soit le nombre de semaines', () => {
    const twice = Array.from({ length: 12 }, (_, i) => ok(Math.floor(i / 2) * 7 + (i % 2) * 3)); // mardi + vendredi
    const thrice = Array.from({ length: 12 }, (_, i) => ok(Math.floor(i / 3) * 7 + (i % 3) * 2));
    expect(run(twice, initialRunWalkState(1)).state.stage).toBe(7);
    expect(run(thrice, initialRunWalkState(1)).state.stage).toBe(7);
  });
  it('RPE ou complétion manquants (import Garmin) → on attend, sans pénalité', () => {
    const r = run([ok(0), { date: addDays(D0, 2), completed: true }]);
    expect(r.state).toMatchObject({ stage: 5, validatedAtStage: 1 });
    expect(r.explanations[1]!.title).toMatch(/Note ton effort/);
    expect(run([{ date: D0, rpe: 3 }]).state.validatedAtStage).toBe(0);
  });
  it('réévaluation : le même journal donne toujours le même état (idempotent), quel que soit l’ordre', () => {
    const s = [ok(4), ok(0), ok(2)];
    expect(run(s).state).toEqual(run([...s].reverse()).state);
  });
});

describe('T2 — marche d’abord', () => {
  it('20 → 25 → 30 min, puis 30 min validées 2 fois → palier 1', () => {
    const r = run([ok(0), ok(2), ok(4), ok(6)], initialRunWalkState(0));
    expect(r.state.stage).toBe(1);
    expect(validationsRequired(0)).toBe(4);
    expect(validationsRequired(0, true)).toBe(5);
  });
  it('une séance trop dure garde les minutes acquises ; reculer = 5 min de moins', () => {
    const hard = run([ok(0), ok(2), { date: addDays(D0, 4), completed: true, rpe: 7 }], initialRunWalkState(0));
    expect(hard.state).toMatchObject({ stage: 0, validatedAtStage: 2 });
    const pain = run([ok(0), ok(2)], initialRunWalkState(0), [{ date: addDays(D0, 2), intensity: 3 }]);
    expect(pain.state).toMatchObject({ stage: 0, validatedAtStage: 0 });
    const gap = run([ok(0), ok(2), ok(12)], initialRunWalkState(0));
    expect(gap.state.validatedAtStage).toBe(3); // pause de 10 j : les 30 min acquises sont gardées, puis la séance compte
    const back = run([ok(0), ok(20)], initialRunWalkState(0));
    expect(back.state.stage).toBe(0);
  });
});

describe('T2 — projection et fin de parcours', () => {
  it('projette le palier de chaque séance si tout est validé', () => {
    expect(projectStages(initialRunWalkState(12), 5).map((p) => p.stage)).toEqual([12, 12, 13, 13, 14]);
    expect(projectStages({ stage: 18, validatedAtStage: 1, failsAtStage: 0 }, 3).map((p) => p.stage)).toEqual([18, 19, 19]);
  });
  it('compte les séances à faire jusqu’à un palier (36 de 1 à 30 min continues)', () => {
    expect(sessionsToReach({ stage: 1, validatedAtStage: 0 }, 14)).toBe(26);
    expect(sessionsToReach({ stage: 1, validatedAtStage: 0 }, 19)).toBe(36);
    expect(sessionsToReach({ stage: 1, validatedAtStage: 1 }, 2)).toBe(1);
    expect(sessionsToReach({ stage: 5, validatedAtStage: 0 }, 3)).toBe(0);
  });
  it('« upcoming » : palier de la prochaine séance compte tenu de la pause jusqu’à aujourd’hui', () => {
    const r = run([ok(0), ok(2)], undefined, [], {}, addDays(D0, 20));
    expect(r.state.stage).toBe(6);
    expect(r.upcoming.stage).toBe(4);
    expect(r.upcomingExplanation!.ruleId).toBe('runwalk.gap');
    expect(run([], initialRunWalkState(3)).upcoming.stage).toBe(3);
  });
  it('parcours terminé : plus rien ne change', () => {
    const r = run([ok(0), ok(30)], initialRunWalkState(19));
    expect(r.state.stage).toBe(19);
    expect(ids(r)).toEqual(['runwalk.done', 'runwalk.done']);
    expect(run([ok(0), ok(2)], { stage: 18, validatedAtStage: 1, failsAtStage: 0 }).explanations[0]!.title).toMatch(/30 min/);
  });
});

describe('plafond de palier (marche seulement)', () => {
  it('séances validées : on reste à la marche, 30 min', () => {
    const sessions = ['2026-04-21', '2026-04-23', '2026-04-25', '2026-04-28', '2026-04-30'].map((date) => ({ date, completed: true, rpe: 3 }));
    const r = nextRunWalkState(initialRunWalkState(0), sessions, [], '2026-05-01', { maxStage: 0 });
    expect(r.state.stage).toBe(0);
    expect(r.explanations.at(-1)!.ruleId).toBe('runwalk.hold');
    expect(walkFirstMinutes(r.state.validatedAtStage)).toBe(30);
    expect(projectStages(initialRunWalkState(0), 8, false, 0).every((p) => p.stage === 0)).toBe(true);
  });
});
