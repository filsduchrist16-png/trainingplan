// Importe le répertoire des courses du Québec depuis des calendriers publics.
// Usage : node scripts/import-races.mjs   →   src/data/races/quebec.json
// À lancer à la main par le mainteneur (jamais depuis l'app) : on garde les faits et un lien vers la source.
import { writeFile } from 'node:fs/promises';
import { mergeRaces, parseEvents, parseIskio, toRace } from './lib/races-parse.mjs';

const SOURCES = [
  { id: 'running.life', url: 'https://running.life/calendrier-course-a-pied/canada/quebec' },
  { id: 'gotrail.run', url: 'https://gotrail.run/calendrier-trails/canada/quebec' },
];
const DELAY_MS = 1500;
const MAX_PAGES = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const UA = 'SentierRaceImport/1.0 (+https://github.com/filsduchrist16-png/trainingplan)';

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
  if (res.status === 404) return ''; // au-delà de la dernière page
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

const ISKIO = { id: 'iskio.ca', url: 'https://www.iskio.ca/courses/', ajax: 'https://www.iskio.ca/wp-admin/admin-ajax.php' };

/** Le calendrier Iskio se charge par l'appel AJAX de sa propre page (200 événements par page, robots.txt l'autorise). */
async function fetchIskio() {
  const races = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = new URLSearchParams({ action: 'wpk3ajax-submit', mode: 'calendar', type: '', append: 'true', query: `loc=&region=&rad=&catg=&sport=&date=&dow=&dist=&also=&disp=compact&calpage=${page}` });
    const res = await fetch(ISKIO.ajax, { method: 'POST', body, headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' } });
    if (!res.ok) throw new Error(`Iskio page ${page} → ${res.status}`);
    const json = await res.json();
    const count = (json.events ?? []).filter((e) => e.lt === 'courses').length;
    if (!count) break;
    races.push(...parseIskio(json));
    await sleep(DELAY_MS);
  }
  return races;
}

const lists = [];
for (const src of SOURCES) {
  const races = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const events = parseEvents(await fetchPage(page === 1 ? src.url : `${src.url}?page=${page}`));
    if (!events.length) break;
    races.push(...events.map((e) => toRace(e, src.id)));
    await sleep(DELAY_MS);
  }
  console.log(`${src.id} : ${races.length} courses`);
  lists.push(races);
}
const iskio = await fetchIskio();
console.log(`${ISKIO.id} : ${iskio.length} courses`);
lists.push(iskio);
const races = mergeRaces(lists);
const out = { generatedAt: new Date().toISOString().slice(0, 10), sources: [...SOURCES, ISKIO].map((s) => ({ id: s.id, url: s.url })), races };
await writeFile(new URL('../src/data/races/quebec.json', import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
console.log(`Total fusionné : ${races.length} courses`);
