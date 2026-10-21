import { describe, expect, it } from 'vitest';
import {
  easyMinutes, easyPace, formatPace, isPlausibleVdot, pacesFromVdot, predictRaceTime, speedForVo2,
  suggestVdotUpdate, sustainableFraction, vdotFromRace, vdotFromVma, vo2AtSpeed,
} from './paces';

describe('VDOT', () => {
  it('retrouve des valeurs connues des tables de Daniels (±0,5)', () => {
    expect(vdotFromRace(5, 20)).toBeCloseTo(49.8, 0); // 5 km en 20:00 ≈ VDOT 50
    expect(vdotFromRace(42.195, 180)).toBeCloseTo(53.5, 0); // marathon 3:00 ≈ VDOT 53-54
  });
  it('inverse correctement la vitesse', () => {
    expect(speedForVo2(vo2AtSpeed(250))).toBeCloseTo(250, 6);
  });
  it('la fraction soutenable décroît avec la durée', () => {
    expect(sustainableFraction(10)).toBeGreaterThan(sustainableFraction(120));
  });
  it('prédit un temps cohérent avec la performance d’origine', () => {
    const v = vdotFromRace(10, 45);
    expect(predictRaceTime(v, 10)).toBeCloseTo(45, 1);
    expect(predictRaceTime(v, 21.0975)).toBeGreaterThan(2 * 45); // le semi est plus lent par km
  });
  it('convertit une VMA', () => {
    expect(vdotFromVma(15)).toBeGreaterThan(40);
    expect(vdotFromVma(15)).toBeLessThan(50);
  });
  it('ordonne les allures E > M > T > I > R (min/km)', () => {
    const p = pacesFromVdot(45);
    expect(p.E).toBeGreaterThan(p.M);
    expect(p.M).toBeGreaterThan(p.T);
    expect(p.T).toBeGreaterThan(p.I);
    expect(p.I).toBeGreaterThan(p.R);
    expect(p.E).toBeGreaterThan(5.5);
    expect(p.E).toBeLessThan(6.6);
  });
  it('valide la plausibilité', () => {
    expect(isPlausibleVdot(45)).toBe(true);
    expect(isPlausibleVdot(10)).toBe(false);
    expect(isPlausibleVdot(99)).toBe(false);
  });
});

describe('allure facile et durées', () => {
  it('utilise une valeur prudente sans référence ou avec un VDOT absurde', () => {
    expect(easyPace(undefined)).toBe(7);
    expect(easyPace(150)).toBe(7);
    expect(easyPace(45)).toBeLessThan(7);
  });
  it('ajoute le terrain et le D+', () => {
    const road = easyMinutes(10, undefined);
    expect(road).toBe(70);
    expect(easyMinutes(10, undefined, { trail: true, gainM: 500 })).toBeCloseTo(15 * 7 * 1.2);
  });
  it('formate une allure', () => {
    expect(formatPace(5.5)).toBe('5:30');
    expect(formatPace(5.999)).toBe('6:00');
  });
});

describe('adaptation de la forme', () => {
  const faster = { targetPace: 5, actualPace: 4.75, rpe: 7 };
  const slower = { targetPace: 5, actualPace: 5.3 };
  const onTarget = { targetPace: 5, actualPace: 5.02 };

  it('ne bouge pas sur une seule séance', () => {
    const r = suggestVdotUpdate(45, [faster]);
    expect(r.vdot).toBe(45);
    expect(r.explanation.ruleId).toBe('fitness.insufficient');
  });
  it('monte si 3 séances concordantes plus rapides et pas à bloc', () => {
    expect(suggestVdotUpdate(45, [onTarget, faster, faster, faster]).vdot).toBe(46);
  });
  it('ne monte pas si c’était à bloc (RPE 9+)', () => {
    expect(suggestVdotUpdate(45, [faster, faster, { ...faster, rpe: 9.5 }]).vdot).toBe(45);
  });
  it('baisse si 3 séances concordantes trop lentes', () => {
    expect(suggestVdotUpdate(45, [slower, slower, slower]).vdot).toBe(44);
  });
  it('confirme si mélangé ou dans la cible', () => {
    expect(suggestVdotUpdate(45, [faster, slower, onTarget]).explanation.ruleId).toBe('fitness.stable');
  });
});
