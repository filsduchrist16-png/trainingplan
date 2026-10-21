// Importe le répertoire des courses du Québec depuis des calendriers publics.
// Usage : node scripts/import-races.mjs   →   src/data/races/quebec.json
// À lancer à la main par le mainteneur (jamais depuis l'app) : on garde les faits et un lien vers la source.
import { writeFile } from 'node:fs/promises';
import { mergeRaces, parseEvents, toRace } from './lib/races-parse.mjs';

const SOURCES = [
  { id: 'running.life', url: 'https://running.life/calendrier-course-a-pied/canada/quebec' },
  { id: 'gotrail.run', url: 'https://gotrail.run/calendrier-trails/canada/quebec' },
];
const DELAY_MS = 1500;
const MAX_PAGES = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'SentierRaceImport/1.0 (+https://github.com/filsduchrist16-png/trainingplan)' }, redirect: 'follow' });
  if (res.status === 404) return ''; // au-delà de la dernière page
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
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
const races = mergeRaces(lists);
const out = { generatedAt: new Date().toISOString().slice(0, 10), sources: SOURCES.map((s) => ({ id: s.id, url: s.url })), races };
await writeFile(new URL('../src/data/races/quebec.json', import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
console.log(`Total fusionné : ${races.length} courses`);
