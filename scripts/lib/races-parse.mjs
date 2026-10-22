// Lecture des calendriers publics et fusion en un répertoire de courses.
// Ne garde que des faits (nom, date, lieu, distances) et le lien vers la page source.

const ACCENTS = /[̀-ͯ]/g;
// « St-Joseph » et « Saint-Joseph » sont la même course : on normalise les abréviations courantes.
const norm = (s) => s.normalize('NFD').replace(ACCENTS, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\bst\b/g, 'saint').replace(/\bste\b/g, 'sainte').trim();
export const slug = (s) => norm(s).replace(/ /g, '-');
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Événements SportsEvent (JSON-LD schema.org) d'une page HTML : Running.life, GoTrail. */
export function parseEvents(html) {
  const out = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) {
    let json;
    try { json = JSON.parse(m[1]); } catch { continue; }
    if (json['@type'] !== 'ItemList') continue;
    for (const li of json.itemListElement ?? []) {
      const e = li.item;
      if (e?.['@type'] === 'SportsEvent' && e.name && ISO.test(e.startDate ?? '')) out.push(e);
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

/**
 * Événements du calendrier Iskio (réponse JSON de son calendrier, `events`) : courses et trails du Québec seulement.
 * Les dates non confirmées par l'organisateur sont gardées avec `dateConfirmed: false` (date estimée).
 */
export function parseIskio(response) {
  const out = [];
  for (const e of response?.events ?? []) {
    if (e.lt !== 'courses' || e.prov !== 'QC') continue;
    const icons = [...(e.spticons ?? '').matchAll(/spticon20-(\w+)"\s+title="([^"]*)"/g)].map((m) => ({ sport: m[1].replace(/^d/, ''), title: m[2].trim() }));
    const sports = new Set(icons.map((i) => i.sport));
    if (!sports.has('course') && !sports.has('trail')) continue; // marche, raquette, triathlon… ne sont pas des courses à pied
    const confirmed = ISO.test(e.date ?? '') && e.date !== '0000-00-00';
    const date = confirmed ? e.date : e.dateest;
    if (!ISO.test(date ?? '')) continue;
    const distancesKm = [...new Set(icons.filter((i) => !/jeunes|enfants|kids/i.test(i.title)).flatMap((i) => {
      const m = i.title.match(/^(\d+(?:[.,]\d+)?)\s*k$/i);
      return m ? [Number(m[1].replace(',', '.'))] : [];
    }))].sort((a, b) => a - b);
    const site = (e.sicons ?? '').match(/href="([^"]+)"[^>]*title="Website"/)?.[1];
    out.push({
      id: `${slug(e.label)}-${date}`,
      name: e.label,
      date,
      ...(confirmed && ISO.test(e.date2 ?? '') && e.date2 !== e.date ? { endDate: e.date2 } : {}),
      city: e.city ?? '',
      ...(e.region ? { region: e.region } : {}),
      kind: sports.has('trail') ? 'trail' : 'route',
      distancesKm,
      url: `https://www.iskio.ca/evenement/${e.value}/`,
      ...(site ? { website: site } : {}),
      ...(confirmed ? {} : { dateConfirmed: false }),
      sources: ['iskio.ca'],
    });
  }
  return out;
}

const pad = (n) => String(n).padStart(2, '0');
/** « 2026-9-27 » → « 2026-09-27 ». */
const isoDate = (s) => {
  const m = String(s ?? '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return m ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : undefined;
};
const textOf = (html) => html.replace(/<[^>]+>/g, '|').replace(/&rsquo;|&#8217;/g, '’').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

/** Tableau « Distance / D+ » d'une description HTML : [{ km, gainM? }]. « À confirmer » → pas de D+. */
export function distanceTable(descriptionHtml = '') {
  const rows = [];
  for (const tr of descriptionHtml.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)) {
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gs)].map((c) => textOf(c[1]).replace(/\|/g, '').trim());
    const km = cells[0]?.match(/^(\d+(?:[.,]\d+)?)\s*km$/i);
    if (!km) continue;
    const gain = cells[1]?.match(/^(\d[\d\s]*)\s*m$/i);
    rows.push({ km: Number(km[1].replace(',', '.')), ...(gain ? { gainM: Number(gain[1].replace(/\s/g, '')) } : {}) });
  }
  return rows;
}

/**
 * Page d'un événement du calendrier Pas sorti du bois (WordPress + EventON) : JSON-LD Event, tableau distances/D+,
 * site de l'organisateur, région, coordonnées. Un calendrier de trail : tout est « trail ».
 */
export function parsePasSorti(html) {
  let event;
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)) {
    try {
      const j = JSON.parse(m[1]);
      if (j?.['@type'] === 'Event' && j.name && isoDate(j.startDate)) { event = j; break; }
    } catch { /* bloc ignoré */ }
  }
  if (!event) return null;
  const date = isoDate(event.startDate);
  const end = isoDate(event.endDate);
  const table = distanceTable(event.description);
  const text = textOf(html);
  const region = text.match(/Région\|+([^|]+)\|/)?.[1]?.trim();
  const site = html.match(/href=['"]([^'"]+)['"][^>]*>\s*<span[^>]*>\s*<i class=['"]fa fa-link['"]/)?.[1];
  const geo = html.match(/data-latlng="(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)"/);
  const name = event.name.replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’');
  const gainByKm = Object.fromEntries(table.filter((r) => r.gainM !== undefined).map((r) => [String(r.km), r.gainM]));
  return {
    id: `${slug(name)}-${date}`,
    name,
    date,
    ...(end && end !== date ? { endDate: end } : {}),
    city: '',
    ...(region ? { region } : {}),
    ...(geo ? { lat: Math.round(Number(geo[1]) * 1e4) / 1e4, lng: Math.round(Number(geo[2]) * 1e4) / 1e4 } : {}),
    kind: 'trail',
    distancesKm: [...new Set(table.map((r) => r.km))].sort((a, b) => a - b),
    ...(Object.keys(gainByKm).length ? { gainByKm } : {}),
    url: event.url,
    ...(site ? { website: site } : {}),
    sources: ['passortidubois.com'],
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
      prev.urls = { ...(prev.urls ?? { [prev.sources[0]]: prev.url }), [r.sources[0]]: r.url };
      prev.sources = [...new Set([...prev.sources, ...r.sources])];
      prev.distancesKm = [...new Set([...prev.distancesKm, ...r.distancesKm])].sort((a, b) => a - b);
      if (r.kind === 'trail') prev.kind = 'trail';
      if (prev.lat === undefined && r.lat !== undefined) { prev.lat = r.lat; prev.lng = r.lng; }
      prev.website ??= r.website;
      if (r.gainByKm) prev.gainByKm = { ...r.gainByKm, ...prev.gainByKm };
      prev.region ??= r.region;
      if (!prev.city && r.city) prev.city = r.city;
      if (r.dateConfirmed === undefined) delete prev.dateConfirmed;
    }
  }
  // Une date estimée est écartée si la même course a une date confirmée à moins d'un an.
  const all = [...byKey.values()];
  const confirmed = new Map();
  for (const r of all) if (r.dateConfirmed !== false) confirmed.set(norm(r.name), [...(confirmed.get(norm(r.name)) ?? []), r.date]);
  const days = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
  const kept = all.filter((r) => r.dateConfirmed !== false || !(confirmed.get(norm(r.name)) ?? []).some((d) => days(d, r.date) < 365));
  return kept.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
