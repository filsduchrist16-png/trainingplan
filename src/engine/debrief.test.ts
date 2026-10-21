import { describe, expect, it } from 'vitest';
import { cardiacDrift, debrief, type DebriefInput } from './debrief';
import { zonesFromHrMax } from './zones';
import type { ActivitySamples } from './types';

const bounds = zonesFromHrMax(190);

/** Série de 5 s : `hrAt(t)` et vitesse constante. */
function series(minutes: number, hrAt: (t: number) => number | null, speed = 3): ActivitySamples {
  const t: number[] = [];
  for (let s = 0; s <= minutes * 60; s += 5) t.push(s);
  return { t, hr: t.map(hrAt), speed: t.map(() => speed) };
}

const easyPlanned = { type: 'z2_endurance' as const, durationMin: 60, steps: [{ kind: 'continu' as const, minutes: 60, target: { zone: 'z2' as const } }], isKey: false };
function input(over: Partial<DebriefInput['activity']>, planned: DebriefInput['planned'] = easyPlanned): DebriefInput {
  return { activity: { durationSec: 3600, distanceKm: 10, elevationGainM: 50, ...over }, planned, bounds, hrMax: 190, cadenceTarget: [172, 176] };
}
const ids = (d: ReturnType<typeof debrief>) => d.findings.map((f) => f.ruleId);

describe('dérive cardiaque', () => {
  it('stable → ~0 ; FC qui monte à vitesse égale → positive', () => {
    expect(cardiacDrift(series(60, () => 135))).toBe(0);
    expect(cardiacDrift(series(60, (t) => 130 + t / 150))!).toBeGreaterThan(0.05);
  });
  it('null sans données suffisantes', () => {
    expect(cardiacDrift({ t: [0, 5] })).toBeNull();
    expect(cardiacDrift(series(5, () => 135))).toBeNull();
  });
});

describe('debrief Z2', () => {
  it('dans la cible, endurance qui tient, cadence ok', () => {
    const d = debrief(input({ samples: series(60, () => 135), cadenceAvg: 174 }));
    expect(ids(d)).toEqual(expect.arrayContaining(['debrief.easy.ok', 'debrief.drift.ok', 'debrief.cadence.ok']));
    expect(d.summary[0]).toBe('Endurance Z2 : 10.0 km en 60 min, 50 m D+.');
    expect(d.summary.length).toBeGreaterThanOrEqual(2);
    expect(d.summary.length).toBeLessThanOrEqual(4);
    expect(d.metrics.paceMinPerKm).toBe(6);
  });
  it('trop dur et en zone grise → plafond proposé', () => {
    const d = debrief(input({ samples: series(60, () => 150) }));
    expect(ids(d)).toEqual(expect.arrayContaining(['debrief.easy.toohard', 'debrief.greyzone']));
    expect(d.adjustments[0]!.title).toBe('Plafonne à 143 bpm');
  });
  it('dérive cardiaque élevée → conseil hydratation', () => {
    const d = debrief(input({ samples: series(60, (t) => 125 + t / 150) }));
    expect(ids(d)).toContain('debrief.drift.high');
    expect(d.adjustments.map((a) => a.ruleId)).toContain('adjust.drift');
  });
  it('pas de dérive calculée en montagne ou sur sortie courte', () => {
    expect(debrief(input({ samples: series(60, () => 135), elevationGainM: 600 })).metrics.drift).toBeUndefined();
    expect(debrief(input({ samples: series(30, () => 135), durationSec: 1800 })).metrics.drift).toBeUndefined();
  });
  it('strides : tolère un peu plus de temps hors zone', () => {
    const tiz: [number, number, number, number, number] = [0, 2900, 500, 200, 0];
    expect(ids(debrief(input({ timeInZonesSec: tiz }, { ...easyPlanned, type: 'strides' })))).toContain('debrief.easy.ok');
    expect(ids(debrief(input({ timeInZonesSec: tiz })))).toContain('debrief.easy.toohard');
  });
  it('cadence basse → conseil graduel (sauf marche-course et côtes)', () => {
    const d = debrief(input({ timeInZonesSec: [0, 3600, 0, 0, 0], cadenceAvg: 164 }));
    expect(ids(d)).toContain('debrief.cadence.low');
    expect(ids(debrief(input({ timeInZonesSec: [0, 3600, 0, 0, 0], cadenceAvg: 164 }, { ...easyPlanned, type: 'marche_course' })))).not.toContain('debrief.cadence.low');
    expect(ids(debrief(input({ timeInZonesSec: [0, 3600, 0, 0, 0], cadenceAvg: 170 })))).not.toContain('debrief.cadence.ok');
  });
});

describe('debrief longue', () => {
  it('détecte la dérive Z2 → Z3 en fin de sortie', () => {
    const d = debrief(input({ durationSec: 7200, distanceKm: 18, elevationGainM: 900, samples: series(120, (t) => (t > 5400 ? 150 : 135)) }, { type: 'longue_facile', durationMin: 120, steps: [], isKey: false }));
    expect(ids(d)).toContain('debrief.longdrift');
    expect(d.adjustments.map((a) => a.ruleId)).toContain('adjust.long');
  });
  it('longue régulière : pas de dérive signalée', () => {
    const d = debrief(input({ durationSec: 7200, distanceKm: 18, samples: series(120, () => 135) }, { type: 'longue_facile', durationMin: 120, steps: [], isKey: false }));
    expect(ids(d)).not.toContain('debrief.longdrift');
  });
});

describe('debrief qualité', () => {
  const seuil = { type: 'seuil' as const, durationMin: 60, isKey: true, steps: [{ kind: 'echauffement' as const, minutes: 15, target: { zone: 'z2' as const } }, { kind: 'effort' as const, minutes: 8, repeat: 4, target: { pace: 'T' as const } }] };
  it('séance faite', () => {
    expect(ids(debrief(input({ timeInZonesSec: [300, 1500, 300, 1500, 0] }, seuil)))).toContain('debrief.quality.ok');
  });
  it('intensité sous la cible : on ne change rien après une seule séance', () => {
    const d = debrief(input({ timeInZonesSec: [300, 3000, 300, 0, 0] }, seuil));
    expect(ids(d)).toContain('debrief.quality.low');
    expect(d.adjustments[0]!.ruleId).toBe('adjust.quality.retry');
  });
  it('séance clé sans effort structuré : rien à comparer', () => {
    expect(ids(debrief(input({ timeInZonesSec: [0, 3600, 0, 0, 0] }, { ...seuil, steps: [] })))).toContain('debrief.quality.ok');
  });
});

describe('honnêteté et durée', () => {
  it('sans FC : le dit', () => {
    const d = debrief({ ...input({ distanceKm: 0, elevationGainM: 0 }), planned: undefined });
    expect(ids(d)).toEqual(['debrief.nohr']);
    expect(d.summary[0]).toMatch(/^Sortie : 0.0 km en 60 min\.$/);
    expect(d.metrics.paceMinPerKm).toBeUndefined();
  });
  it('FC calculée depuis les échantillons si le temps par zone manque', () => {
    expect(debrief(input({ samples: series(60, () => 135) })).metrics.zoneShare![1]).toBe(1);
  });
  it('plus court : pas de culpabilité ; plus long : on absorbe', () => {
    expect(ids(debrief(input({ durationSec: 1800, timeInZonesSec: [0, 1800, 0, 0, 0] })))).toContain('debrief.short');
    const long = debrief(input({ durationSec: 5400, timeInZonesSec: [0, 5400, 0, 0, 0] }));
    expect(ids(long)).toContain('debrief.long');
    expect(long.adjustments.map((a) => a.ruleId)).toContain('adjust.absorb');
  });
  it('séance sans type prévu : pas de jugement d’intensité', () => {
    const d = debrief({ ...input({ timeInZonesSec: [0, 3600, 0, 0, 0] }), planned: undefined });
    expect(d.findings).toEqual([]);
  });
});

describe('robustesse', () => {
  it('échantillons sans FC ni vitesse : pas de calcul inventé', () => {
    const t = Array.from({ length: 1500 }, (_, i) => i * 5);
    const d = debrief(input({ durationSec: 7200, timeInZonesSec: [0, 7200, 0, 0, 0], samples: { t, hr: t.map(() => null) } }, { type: 'longue_facile', durationMin: 120, steps: [], isKey: false }));
    expect(d.metrics.drift).toBeUndefined();
    expect(ids(d)).not.toContain('debrief.longdrift');
  });
  it('efforts en secondes (30/30) comptés dans l’effort prévu', () => {
    const vo2 = { type: 'vo2max' as const, durationMin: 45, isKey: true, steps: [{ kind: 'effort' as const, seconds: 30, repeat: 12, target: { pace: 'I' as const } }, { kind: 'effort' as const, minutes: 2, target: { pace: 'I' as const } }] };
    expect(ids(debrief(input({ timeInZonesSec: [600, 1800, 0, 0, 0] }, vo2)))).toContain('debrief.quality.low');
  });
});
