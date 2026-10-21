import { describe, expect, it } from 'vitest';
// @ts-expect-error module JS sans types (script d'import)
import { distancesFrom, mergeRaces, parseEvents, slug, toRace } from '../../../scripts/lib/races-parse.mjs';
import { closestDistance, loadRaceCatalog, searchRaces, type CatalogRace } from '.';

const html = (events: object[]) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'ItemList', itemListElement: events.map((item) => ({ '@type': 'ListItem', item })) })}</script><script type="application/ld+json">{pas du json</script><script type="application/ld+json">{"@type":"BreadcrumbList"}</script>`;
const ev = (over: object = {}) => ({ '@type': 'SportsEvent', name: 'Trail du Grand-Duc', description: 'Deux jours de courses sur sentiers avec plusieurs distances de 2,5 km à 40 km', url: 'https://running.life/fr/evenement/grand-duc', startDate: '2026-10-24', endDate: '2026-10-25', location: { name: 'Stoneham', address: { addressLocality: 'Stoneham-et-Tewkesbury' }, geo: { latitude: 47.12095, longitude: -71.409135 } }, ...over });

describe('import des courses (scripts/lib/races-parse.mjs)', () => {
  it('lit les SportsEvent du JSON-LD, ignore le reste', () => {
    const events = parseEvents(html([ev(), ev({ '@type': 'Thing' }), ev({ startDate: 'bientôt' }), ev({ name: 'Marathon Gaspesia', startDate: '2026-10-24' })]));
    expect(events.map((e: { name: string }) => e.name)).toEqual(['Trail du Grand-Duc', 'Marathon Gaspesia']);
  });
  it('extrait les distances', () => {
    expect(distancesFrom('distances de 2,5 km à 40 km')).toEqual([2.5, 40]);
    expect(distancesFrom('semi-marathon et 10 km')).toEqual([10, 21.1]);
    expect(distancesFrom('Marathon routier')).toEqual([42.2]);
    expect(distancesFrom('Ultra marathon de 80 km')).toEqual([80]);
    expect(distancesFrom(undefined)).toEqual([]);
    expect(distancesFrom('9999 km')).toEqual([]);
  });
  it('normalise une course', () => {
    const r = toRace(ev(), 'running.life');
    expect(r).toMatchObject({ id: 'trail-du-grand-duc-2026-10-24', city: 'Stoneham-et-Tewkesbury', kind: 'trail', endDate: '2026-10-25', lat: 47.121, distancesKm: [2.5, 40], sources: ['running.life'] });
    expect(toRace(ev({ name: 'Course du Lac', description: 'Course routière 5 km', endDate: '2026-10-24', location: { name: 'Lac' } }), 'running.life')).toMatchObject({ kind: 'route', city: 'Lac', distancesKm: [5] });
    expect(toRace(ev({ name: 'X', description: undefined, location: undefined }), 'gotrail.run')).toMatchObject({ kind: 'trail', city: '', distancesKm: [] });
    expect(slug('Défi des Écureuils!')).toBe('defi-des-ecureuils');
  });
  it('fusionne les sources (même nom sans accents, même date), garde les liens de chaque source', () => {
    const a = toRace(ev({ name: 'Défi Grand-Duc', description: '10 km', location: undefined }), 'running.life');
    const b = toRace(ev({ name: 'Defi grand duc', description: '5 km', url: 'https://gotrail.run/x' }), 'gotrail.run');
    const c = toRace(ev({ name: 'Autre', startDate: '2026-09-01' }), 'running.life');
    const merged = mergeRaces([[a, c], [b]]);
    expect(merged.map((r: CatalogRace) => r.name)).toEqual(['Autre', 'Défi Grand-Duc']);
    expect(merged[1]).toMatchObject({ distancesKm: [5, 10], kind: 'trail', lat: 47.121, sources: ['running.life', 'gotrail.run'], urls: { 'running.life': a.url, 'gotrail.run': 'https://gotrail.run/x' } });
  });
});

describe('répertoire du Québec', () => {
  const races: CatalogRace[] = [
    { id: 'a', name: 'Course des Récoltes', date: '2026-10-24', city: 'Saint-Hyacinthe', kind: 'route', distancesKm: [5, 10], url: 'u', sources: ['x'] },
    { id: 'b', name: 'Trail du Grand-Duc', date: '2026-10-24', endDate: '2026-10-25', city: 'Stoneham', kind: 'trail', distancesKm: [2.5, 20, 40], url: 'u', sources: ['x'] },
    { id: 'c', name: 'Vieille course', date: '2026-01-01', city: 'Québec', kind: 'route', distancesKm: [], url: 'u', sources: ['x'] },
  ];
  it('cherche par nom ou ville, sans accents ni casse, courses à venir seulement', () => {
    expect(searchRaces(races, 'recoltes', '2026-10-21').map((r) => r.id)).toEqual(['a']);
    expect(searchRaces(races, 'stoneham trail', '2026-10-21').map((r) => r.id)).toEqual(['b']);
    expect(searchRaces(races, '', '2026-10-21').map((r) => r.id)).toEqual(['a', 'b']);
    expect(searchRaces(races, 'course', '2026-10-21').map((r) => r.id)).toEqual(['a']);
    expect(searchRaces(races, '', '2026-10-25').map((r) => r.id)).toEqual(['b']); // encore en cours le dernier jour
    expect(searchRaces(races, '', '2026-10-21', 'trail').map((r) => r.id)).toEqual(['b']);
    expect(searchRaces(races, '', '2026-10-21', undefined, 1)).toHaveLength(1);
  });
  it('distance la plus proche de l’objectif', () => {
    expect(closestDistance(races[1]!, 21.1)).toBe(20);
    expect(closestDistance(races[1]!, 5)).toBe(2.5);
    expect(closestDistance(races[2]!, 10)).toBeUndefined();
  });
  it('le répertoire inclus est valide', async () => {
    const catalog = await loadRaceCatalog();
    expect(catalog.races.length).toBeGreaterThan(50);
    expect(catalog.sources.length).toBeGreaterThan(0);
    for (const r of catalog.races) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.url).toMatch(/^https:\/\//);
      expect(['route', 'trail']).toContain(r.kind);
    }
    expect(new Set(catalog.races.map((r) => r.id)).size).toBe(catalog.races.length);
  });
});
