// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseGarminCsv, parseDuration, parseNumber } from './csv';
import { parseFit } from './fit';
import { parseGpx, parseTcx } from './xml';
import { elevationFromAltitude, haversine, max, mean, movingTime, resample } from './samples';
import { CSV_SAMPLE, GPX_SAMPLE, TCX_SAMPLE, makeFit } from './fixtures';

describe('FIT (SDK Garmin)', () => {
  it('lit une course trail : résumé de session, cadence en pas/min, Training Load', () => {
    const a = parseFit(makeFit({ minutes: 30 }));
    expect(a.source).toBe('fit');
    expect(a.sport).toBe('trail');
    expect(a.terrain).toBe('sentier');
    expect(a.startTime).toBe('2026-10-20T09:30:00.000Z');
    expect(a.durationSec).toBe(1800);
    expect(a.movingSec).toBe(1770);
    expect(a.distanceKm).toBe(5.4);
    expect(a.elevationGainM).toBe(120);
    expect(a.hrAvg).toBe(138);
    expect(a.cadenceAvg).toBe(173);
    expect(a.garminTrainingLoad).toBe(75);
    expect(a.samples!.t[1]).toBe(5);
    expect(a.samples!.hr!.length).toBe(361);
    expect(a.samples!.cadence![0]).toBe(173);
  });
  it('sans message de session : tout est recalculé depuis les points', () => {
    const a = parseFit(makeFit({ minutes: 20, withSession: false }));
    expect(a.distanceKm).toBeCloseTo(3.6, 1);
    expect(a.hrAvg).toBeGreaterThan(130);
    expect(a.elevationGainM).toBeGreaterThan(0);
    expect(a.movingSec).toBe(1200);
  });
  it('autres sports', () => {
    expect(parseFit(makeFit({ sport: 'cycling', subSport: 'road' })).sport).toBe('velo');
    expect(parseFit(makeFit({ sport: 'running', subSport: 'street' })).terrain).toBe('route');
    expect(parseFit(makeFit({ sport: 'hiking', subSport: 'generic' })).sport).toBe('marche');
    expect(parseFit(makeFit({ sport: 'swimming', subSport: 'lapSwimming' })).sport).toBe('natation');
    expect(parseFit(makeFit({ sport: 'training', subSport: 'strengthTraining' })).sport).toBe('muscu');
    expect(parseFit(makeFit({ sport: 'walking', subSport: 'generic' })).terrain).toBeUndefined();
    expect(parseFit(makeFit({ sport: 'rowing', subSport: 'generic' })).sport).toBe('autre');
  });
  it('refuse un fichier qui n’est pas un FIT', () => {
    expect(() => parseFit(new TextEncoder().encode('bonjour, je suis un texte').buffer as ArrayBuffer)).toThrow(/FIT/);
  });
});

describe('GPX', () => {
  it('lit une trace Garmin avec FC, cadence et altitude', () => {
    const a = parseGpx(GPX_SAMPLE);
    expect(a.sport).toBe('trail');
    expect(a.name).toBe('Sentier des Loups');
    expect(a.durationSec).toBe(1200);
    expect(a.distanceKm).toBeCloseTo(2.67, 1);
    expect(a.elevationGainM).toBe(120);
    expect(a.elevationLossM).toBe(120);
    expect(a.hrAvg).toBe(137);
    expect(a.cadenceAvg).toBe(170);
  });
  it('refuse une trace planifiée (sans temps) ou vide', () => {
    expect(() => parseGpx(GPX_SAMPLE.replace(/<time>[^<]+<\/time>/g, ''))).toThrow(/horodatage/);
    expect(() => parseGpx('<gpx></gpx>')).toThrow(/Aucune trace/);
    expect(() => parseGpx('<gpx><oups')).toThrow(/illisible/);
  });
  it('devine le sport depuis le type', () => {
    expect(parseGpx(GPX_SAMPLE.replace('trail_running', 'hiking')).sport).toBe('marche');
    expect(parseGpx(GPX_SAMPLE.replace('trail_running', 'cycling')).sport).toBe('velo');
    expect(parseGpx(GPX_SAMPLE.replace('<type>trail_running</type>', '')).sport).toBe('course');
  });
});

describe('TCX', () => {
  it('lit les Trackpoints, la FC et la cadence TPX', () => {
    const a = parseTcx(TCX_SAMPLE);
    expect(a.sport).toBe('course');
    expect(a.distanceKm).toBe(3);
    expect(a.durationSec).toBe(900);
    expect(a.hrAvg).toBe(141);
    expect(a.cadenceAvg).toBe(174);
    expect(a.samples!.speed!.at(-1)).toBeCloseTo(3.33, 1);
  });
  it('vélo, autre et sans activité', () => {
    expect(parseTcx(TCX_SAMPLE.replace('Sport="Running"', 'Sport="Biking"')).sport).toBe('velo');
    expect(parseTcx(TCX_SAMPLE.replace('Sport="Running"', 'Sport="Other"')).sport).toBe('autre');
    expect(() => parseTcx('<TrainingCenterDatabase></TrainingCenterDatabase>')).toThrow(/Aucune activité/);
  });
});

describe('CSV Garmin Connect', () => {
  it('lit les lignes valides, nombres avec milliers et durées', () => {
    const rows = parseGarminCsv(CSV_SAMPLE);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ sport: 'trail', name: 'Jacques-Cartier, boucle', distanceKm: 21.35, durationSec: 9910, elevationGainM: 1050, hrAvg: 141, garminTrainingLoad: 180 });
    expect(rows[1]!.garminTrainingLoad).toBeUndefined();
    expect(rows[2]!.sport).toBe('muscu');
  });
  it('en-têtes en français', () => {
    const fr = "Type d'activité,Date,Titre,Distance,Durée,FC moyenne\nCourse à pied,2026-10-01 07:00:00,Sortie,10,\"55:00\",140\nVélo,2026-10-02 07:00:00,Vélo,30,1:00:00,120\nNatation,2026-10-03 07:00:00,Nage,2,40:00,--\nRandonnée,2026-10-04 07:00:00,Rando,12,3:00:00,--\nYoga,2026-10-05 07:00:00,Yoga,0,30:00,--";
    expect(parseGarminCsv(fr).map((r) => r.sport)).toEqual(['course', 'velo', 'natation', 'marche', 'autre']);
  });
  it('nombres et durées', () => {
    expect(parseNumber('1 234,5')).toBe(1234.5);
    expect(parseNumber('1,234.5')).toBe(1234.5);
    expect(parseNumber('abc')).toBeUndefined();
    expect(parseNumber(undefined)).toBeUndefined();
    expect(parseDuration('01:02:03')).toBe(3723);
    expect(parseDuration('45:10.5')).toBe(2711);
    expect(parseDuration('x:y')).toBeUndefined();
    expect(parseDuration(undefined)).toBeUndefined();
  });
});

describe('outils d’échantillonnage', () => {
  it('rééchantillonne à 5 s en gardant la dernière valeur connue', () => {
    const s = resample([{ t: 0, hr: 100 }, { t: 7, hr: null }, { t: 12, hr: 120 }]);
    expect(s.t).toEqual([0, 5, 10]);
    expect(s.hr).toEqual([100, 100, 100]);
    expect(s.speed).toBeUndefined();
    expect(resample([]).t).toEqual([0]);
  });
  it('D+ avec hystérésis (ignore le bruit)', () => {
    expect(elevationFromAltitude([100, 101, 100, 101, 100])).toEqual({ gain: 0, loss: 0 });
    expect(elevationFromAltitude([null, 100, 110, 105, 95])).toEqual({ gain: 10, loss: 15 });
  });
  it('haversine, moyennes, temps en mouvement', () => {
    expect(haversine(46.8, -71.2, 46.81, -71.2)).toBeCloseTo(1112, -1);
    expect(mean([null, 0, 10, 20])).toBe(15);
    expect(mean([])).toBeUndefined();
    expect(max([null, 3, 7])).toBe(7);
    expect(max([])).toBeUndefined();
    expect(movingTime([{ t: 0 }, { t: 5 }])).toBeUndefined();
    expect(movingTime([{ t: 0, speed: 3 }, { t: 5, speed: 3 }, { t: 10, speed: 0 }])).toBe(5);
  });
});
