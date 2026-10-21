import { describe, expect, it } from 'vitest';
import { estimateHrMax, greyZone, hrMaxFromTest, timeInZones, zoneIndexOf, zoneOf, zoneRange, zonesFromHrMax, zonesKarvonen, ZONE_FEEL } from './zones';

describe('zones FC', () => {
  it('reproduit les zones du brief pour FCmax 190', () => {
    expect(zonesFromHrMax(190)).toEqual([123, 143, 162, 176]);
  });
  it('Karvonen retombe sur le modèle %FCmax pour la FC repos de référence', () => {
    expect(zonesKarvonen(190, 60)).toEqual([123, 143, 162, 176]);
  });
  it('Karvonen remonte les zones basses quand la FC repos est basse… et inversement', () => {
    const low = zonesKarvonen(190, 45);
    expect(low[0]).toBeLessThan(123);
    expect(zonesKarvonen(190, 70)[0]).toBeGreaterThan(123);
  });
  it('estime la FCmax par l’âge', () => {
    expect(estimateHrMax(36)).toBe(183);
  });
  it('classe une FC dans sa zone', () => {
    const b = zonesFromHrMax(190);
    expect(zoneOf(110, b)).toBe('z1');
    expect(zoneOf(123, b)).toBe('z2');
    expect(zoneOf(150, b)).toBe('z3');
    expect(zoneOf(170, b)).toBe('z4');
    expect(zoneOf(185, b)).toBe('z5');
    expect(zoneIndexOf(200, b)).toBe(4);
  });
  it('donne la plage d’une zone', () => {
    const b = zonesFromHrMax(190);
    expect(zoneRange('z1', b, 190)).toEqual([0, 123]);
    expect(zoneRange('z2', b, 190)).toEqual([123, 143]);
    expect(zoneRange('z5', b, 190)).toEqual([176, 190]);
  });
  it('calcule le temps par zone en ignorant les trous', () => {
    const b = zonesFromHrMax(190);
    const s = { t: [0, 5, 10, 15, 20], hr: [130, 130, null, 150, 150] };
    expect(timeInZones(s, b)).toEqual([0, 10, 5, 0, 0]);
    expect(timeInZones({ t: [0, 5] }, b)).toEqual([0, 0, 0, 0, 0]);
  });
  it('donne la zone grise', () => {
    expect(greyZone(190)).toEqual([145, 155]);
  });
  it('a un ressenti pour chaque zone', () => {
    expect(Object.keys(ZONE_FEEL)).toHaveLength(5);
  });
});

describe('calibration FCmax', () => {
  it('retient le max soutenu et ignore un pic d’artefact', () => {
    const t = Array.from({ length: 40 }, (_, i) => i);
    const hr = t.map((i) => (i < 20 ? 150 + i : 186));
    hr[5] = 230; // artefact
    hr[30] = null as unknown as number;
    expect(hrMaxFromTest({ t, hr })).toBe(186);
  });
  it('refuse sans données suffisantes', () => {
    expect(hrMaxFromTest({ t: [0] })).toBeNull();
    expect(hrMaxFromTest({ t: [0, 1, 2], hr: [150, 160, 170] })).toBeNull();
    expect(hrMaxFromTest({ t: [0, 20], hr: [null, null] })).toBeNull();
  });
});
