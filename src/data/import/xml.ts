import type { Sport } from '@/engine/types';
import { elevationFromAltitude, haversine, max, mean, movingTime, resample } from './samples';
import type { ParsedActivity, RawPoint } from './types';

/** Utilitaires XML insensibles aux préfixes d'espace de noms (gpxtpx:hr, ns3:TPX…). */
function children(el: Element | Document, local: string): Element[] {
  return [...el.getElementsByTagName('*')].filter((e) => e.localName === local);
}
function first(el: Element, local: string): Element | undefined {
  return children(el, local)[0];
}
function num(el: Element | undefined): number | null {
  if (!el?.textContent) return null;
  const n = Number(el.textContent.trim());
  return Number.isFinite(n) ? n : null;
}

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML illisible.');
  return doc;
}

function summarize(points: RawPoint[], startIso: string, source: 'gpx' | 'tcx', sport: Sport, name?: string, totalDistanceM?: number): ParsedActivity {
  if (points.length < 2) throw new Error('Pas assez de points dans ce fichier.');
  const elevation = elevationFromAltitude(points.map((p) => p.altitude));
  const distanceM = totalDistanceM ?? max(points.map((p) => p.distance)) ?? 0;
  return {
    source,
    sport,
    ...(sport === 'trail' ? { terrain: 'sentier' as const } : {}),
    ...(name ? { name } : {}),
    startTime: startIso,
    durationSec: points.at(-1)!.t,
    movingSec: movingTime(points),
    distanceKm: Math.round((distanceM / 1000) * 100) / 100,
    elevationGainM: elevation.gain,
    elevationLossM: elevation.loss,
    hrAvg: mean(points.map((p) => p.hr)),
    hrMax: max(points.map((p) => p.hr)),
    cadenceAvg: mean(points.map((p) => p.cadence)),
    samples: resample(points),
  };
}

/** GPX : coordonnées, altitude, temps, et extensions Garmin (FC, cadence). */
export function parseGpx(text: string): ParsedActivity {
  const doc = parseXml(text);
  const pts = children(doc, 'trkpt');
  if (!pts.length) throw new Error('Aucune trace dans ce GPX.');
  const name = children(doc, 'name')[0]?.textContent?.trim() || undefined;
  const type = children(doc, 'type')[0]?.textContent?.trim().toLowerCase();
  const t0 = Date.parse(first(pts[0]!, 'time')?.textContent ?? '');
  if (!Number.isFinite(t0)) throw new Error('Ce GPX n’a pas d’horodatage (trace planifiée, pas une activité).');
  let dist = 0;
  let prev: { lat: number; lon: number; t: number } | null = null;
  const points: RawPoint[] = pts.map((p) => {
    const lat = Number(p.getAttribute('lat'));
    const lon = Number(p.getAttribute('lon'));
    const t = (Date.parse(first(p, 'time')?.textContent ?? '') - t0) / 1000;
    let speed: number | null = null;
    if (prev) {
      const d = haversine(prev.lat, prev.lon, lat, lon);
      dist += d;
      speed = t > prev.t ? d / (t - prev.t) : null;
    }
    prev = { lat, lon, t };
    const cad = num(first(p, 'cad'));
    return { t: Math.round(t), hr: num(first(p, 'hr')), altitude: num(first(p, 'ele')), cadence: cad != null ? cad * 2 : null, distance: dist, speed };
  });
  const sport: Sport = type?.includes('trail') ? 'trail' : type?.includes('hik') || type?.includes('walk') ? 'marche' : type?.includes('bik') || type?.includes('cycl') ? 'velo' : 'course';
  return summarize(points, new Date(t0).toISOString(), 'gpx', sport, name, dist);
}

/** TCX : Trackpoints avec FC, distance cumulée, altitude, cadence (extensions TPX). */
export function parseTcx(text: string): ParsedActivity {
  const doc = parseXml(text);
  const activity = children(doc, 'Activity')[0];
  if (!activity) throw new Error('Aucune activité dans ce TCX.');
  const tps = children(activity, 'Trackpoint');
  const t0 = Date.parse(children(activity, 'Id')[0]?.textContent ?? first(tps[0]!, 'Time')?.textContent ?? '');
  const points: RawPoint[] = tps
    .map((p) => {
      const hrEl = first(p, 'HeartRateBpm');
      const cad = num(first(p, 'RunCadence')) ?? num(first(p, 'Cadence'));
      return {
        t: Math.round((Date.parse(first(p, 'Time')?.textContent ?? '') - t0) / 1000),
        hr: hrEl ? num(first(hrEl, 'Value')) : null,
        altitude: num(first(p, 'AltitudeMeters')),
        distance: num(first(p, 'DistanceMeters')),
        cadence: cad != null ? cad * 2 : null,
        speed: num(first(p, 'Speed')),
      };
    })
    .filter((p) => Number.isFinite(p.t));
  // Vitesse dérivée de la distance quand l'extension manque.
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (b.speed == null && a.distance != null && b.distance != null && b.t > a.t) b.speed = (b.distance - a.distance) / (b.t - a.t);
  }
  const sportAttr = activity.getAttribute('Sport')?.toLowerCase();
  const laps = children(activity, 'Lap');
  const total = laps.reduce((s, l) => s + (num(first(l, 'DistanceMeters')) ?? 0), 0);
  const sport: Sport = sportAttr === 'biking' ? 'velo' : sportAttr === 'running' ? 'course' : 'autre';
  return summarize(points, new Date(t0).toISOString(), 'tcx', sport, undefined, total || undefined);
}
