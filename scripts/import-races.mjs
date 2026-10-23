// Importe le répertoire des courses du Québec depuis des calendriers publics.
// Usage : node scripts/import-races.mjs   →   src/data/races/quebec.json
// À lancer à la main par le mainteneur (jamais depuis l'app) : on garde les faits et un lien vers la source.
import { writeFile } from 'node:fs/promises';
import { mergeRaces, parseEvents, parseIskio, parsePasSorti, toRace } from './lib/races-parse.mjs';

const SOURCES = [
  { id: 'running.life', url: 'https://running.life/calendrier-course-a-pied/canada/quebec' },
  { id: 'gotrail.run', url: 'https://gotrail.run/calendrier-trails/canada/quebec' },
];
const DELAY_MS = 1500;
const MAX_PAGES = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const UA = 'SentierRaceImport/1.0 (+https://github.com/filsduchrist16-png/trainingplan)';

/** Le site a mis un captcha anti-robot (ex. SiteGround) : on respecte ce choix, on n'insiste pas et on ne contourne pas. */
class BlockedError extends Error {}
const isChallenge = (res, text) => res.status === 202 || /sgcaptcha|captcha/i.test(text.slice(0, 600));

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
  if (res.status === 404) return ''; // au-delà de la dernière page
  const text = await res.text();
  if (isChallenge(res, text)) throw new BlockedError(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return text;
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

const PSDB = { id: 'passortidubois.com', url: 'https://passortidubois.com/calendrier-de-trail-2026/', rest: 'https://passortidubois.com/wp-json/wp/v2/ajde_events' };

/** Pas sorti du bois : la liste des événements vient de l'API REST publique de WordPress, le détail de chaque page. */
async function fetchPasSorti() {
  const links = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(`${PSDB.rest}?per_page=100&page=${page}&_fields=link`, { headers: { 'user-agent': UA } });
    const text = await res.text();
    if (isChallenge(res, text)) throw new BlockedError(PSDB.rest);
    if (res.status === 400) break; // au-delà de la dernière page
    if (!res.ok) throw new Error(`Pas sorti du bois, liste page ${page} → ${res.status}`);
    const batch = JSON.parse(text);
    links.push(...batch.map((e) => e.link));
    if (batch.length < 100) break;
    await sleep(DELAY_MS);
  }
  const today = new Date().toISOString().slice(0, 10);
  const races = [];
  for (const link of links) {
    const race = parsePasSorti(await fetchPage(link));
    if (race && (race.endDate ?? race.date) >= today) races.push(race); // les éditions passées ne servent pas
    await sleep(DELAY_MS / 2);
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
let psdbOk = false;
try {
  const psdb = await fetchPasSorti();
  console.log(`${PSDB.id} : ${psdb.length} courses à venir`);
  lists.push(psdb);
  psdbOk = true;
} catch (e) {
  if (!(e instanceof BlockedError)) throw e;
  console.warn(`${PSDB.id} : bloqué par le captcha anti-robot du site (${e.message}). Source ignorée : ni contournement, ni nouvelle tentative. Demande l'accord ou un export à l'auteur du site.`);
}
const races = mergeRaces(lists);
const out = { generatedAt: new Date().toISOString().slice(0, 10), sources: [...SOURCES, ISKIO, ...(psdbOk ? [PSDB] : [])].map((s) => ({ id: s.id, url: s.url })), races };
await writeFile(new URL('../src/data/races/quebec.json', import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
console.log(`Total fusionné : ${races.length} courses`);
