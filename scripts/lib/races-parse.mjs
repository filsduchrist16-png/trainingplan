// Lecture des calendriers publics (JSON-LD schema.org SportsEvent) et fusion en un répertoire de courses.
// Ne garde que des faits (nom, date, lieu, distances) et le lien vers la page source.

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const slug = (s) => norm(s).replace(/ /g, '-');

/** Événements SportsEvent d'une page HTML. */
export function parseEvents(html) {
  const out = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) {
    let json;
    try { json = JSON.parse(m[1]); } catch { continue; }
    if (json['@type'] !== 'ItemList') continue;
    for (const li of json.itemListElement ?? []) {
      const e = li.item;
      if (e?.['@type'] === 'SportsEvent' && e.name && /^\d{4}-\d{2}-\d{2}$/.test(e.startDate ?? '')) out.push(e);
    }
  }
  return out;
}

/** Distances (km) citées dans une description : « de 2,5 km à 40 km », « 10 km », « semi », « marathon »… */
export function distancesFrom(text = '') {
  const found = new Set();
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*km/gi)) {
    const km = Number(m[1].replace(',', '.'));
    if (km > 0 && km <= 500) found.add(km);
  }
  if (/semi[- ]?marathon/i.test(text)) found.add(21.1);
  else if (/\bmarathon\b/i.test(text) && !/ultra/i.test(text)) found.add(42.2);
  return [...found].sort((a, b) => a - b);
}

export function toRace(e, source) {
  const loc = e.location ?? {};
  const text = `${e.name} ${e.description ?? ''}`;
  const trail = source === 'gotrail.run' || /sentier|trail|montagne|ultra|d\+|dénivel/i.test(text);
  return {
    id: `${slug(e.name)}-${e.startDate}`,
    name: e.name,
    date: e.startDate,
    ...(e.endDate && e.endDate !== e.startDate ? { endDate: e.endDate } : {}),
    city: loc.address?.addressLocality ?? loc.name ?? '',
    ...(loc.geo?.latitude ? { lat: Math.round(loc.geo.latitude * 1e4) / 1e4, lng: Math.round(loc.geo.longitude * 1e4) / 1e4 } : {}),
    kind: trail ? 'trail' : 'route',
    distancesKm: distancesFrom(e.description),
    url: e.url,
    sources: [source],
  };
}

/** Fusionne les courses des différentes sources (même nom normalisé et même date). */
export function mergeRaces(lists) {
  const byKey = new Map();
  for (const races of lists) {
    for (const r of races) {
      const key = `${norm(r.name)}|${r.date}`;
      const prev = byKey.get(key);
      if (!prev) { byKey.set(key, r); continue; }
      prev.sources = [...new Set([...prev.sources, ...r.sources])];
      prev.distancesKm = [...new Set([...prev.distancesKm, ...r.distancesKm])].sort((a, b) => a - b);
      if (r.kind === 'trail') prev.kind = 'trail';
      if (prev.lat === undefined && r.lat !== undefined) { prev.lat = r.lat; prev.lng = r.lng; }
      prev.urls = { ...(prev.urls ?? { [prev.sources[0]]: prev.url }), [r.sources[0]]: r.url };
    }
  }
  return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
