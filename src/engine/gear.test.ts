import { describe, expect, it } from 'vitest';
import { gearAdvice, shoeStatus, suggestShoe, type ShoeChoice } from './gear';
import type { Shoe } from './types';

const shoe = (id: string, over: Partial<Shoe> = {}): Shoe => ({ id, athleteId: 'a', createdAt: '', updatedAt: '', name: id, initialKm: 0, breakInKm: 0, retireKm: 700, active: true, terrain: 'route', ...over });
const c = (id: string, km: number, over: Partial<Shoe> = {}): ShoeChoice => ({ shoe: shoe(id, over), km });

describe('usure des chaussures', () => {
  it('rodage, ok, usure, retraite', () => {
    expect(shoeStatus(shoe('a', { breakInKm: 50 }), 20)).toMatchObject({ state: 'rodage', explanation: { ruleId: 'gear.breakin' } });
    expect(shoeStatus(shoe('a', { breakInKm: 50 }), 20).explanation!.why).toContain('20 km sur 50');
    const ok = shoeStatus(shoe('a', { breakInKm: 50 }), 300);
    expect(ok).toMatchObject({ state: 'ok', remainingKm: 400, usedShare: 0.429 });
    expect(ok.explanation).toBeUndefined();
    expect(shoeStatus(shoe('a'), 0)).toMatchObject({ state: 'ok' });
    expect(shoeStatus(shoe('a'), 620)).toMatchObject({ state: 'usure', remainingKm: 80, explanation: { ruleId: 'gear.wear', severity: 'conseil' } });
    expect(shoeStatus(shoe('a'), 700)).toMatchObject({ state: 'retraite', explanation: { ruleId: 'gear.retire', severity: 'attention' } });
    expect(shoeStatus(shoe('a'), 820).explanation!.why).toContain('820 km');
  });
  it('durée de vie nulle : pas de division par zéro', () => {
    expect(shoeStatus(shoe('a', { retireKm: 0 }), 50).usedShare).toBe(0);
  });
});

describe('quelle paire pour cette sortie', () => {
  it('terrain : sentier pour le trail, route pour la route ; la moins usée d’abord', () => {
    const shoes = [c('route-neuve', 50, { terrain: 'route' }), c('route-vieille', 400, { terrain: 'route' }), c('trail', 100, { terrain: 'sentier' }), c('mixte', 500, { terrain: 'mixte' })];
    expect(suggestShoe(shoes, { trail: true })!.shoe.id).toBe('trail');
    expect(suggestShoe(shoes, { trail: false })!.shoe.id).toBe('route-neuve');
    expect(suggestShoe(shoes.slice(1, 2), { trail: true })!.shoe.id).toBe('route-vieille'); // à défaut, la seule paire disponible
  });
  it('jamais une paire à remplacer ou inactive ; pas de paire en rodage pour une séance dure', () => {
    const shoes = [c('morte', 800), c('inactive', 10, { active: false }), c('rodage', 10, { breakInKm: 50 }), c('rodee', 300, { breakInKm: 50 })];
    expect(suggestShoe(shoes, { trail: false, hard: true })!.shoe.id).toBe('rodee');
    expect(suggestShoe(shoes, { trail: false })!.shoe.id).toBe('rodage');
    expect(suggestShoe([c('morte', 800)], { trail: false })).toBeUndefined();
    expect(suggestShoe([], { trail: true })).toBeUndefined();
  });
});

describe('conseils d’équipement', () => {
  it('aucune paire : on invite à en ajouter', () => {
    expect(gearAdvice([]).map((e) => e.ruleId)).toEqual(['gear.none']);
  });
  it('une seule paire active depuis 100 km : alterner', () => {
    expect(gearAdvice([c('a', 150)]).map((e) => e.ruleId)).toEqual(['gear.rotation']);
    expect(gearAdvice([c('a', 150), c('b', 10)]).map((e) => e.ruleId)).toEqual([]);
    expect(gearAdvice([c('a', 50)])).toEqual([]);
    expect(gearAdvice([c('a', 150), c('vieille', 300, { active: false })]).map((e) => e.ruleId)).toEqual(['gear.rotation']);
  });
  it('les avis d’usure et de rodage remontent, sauf pour les paires inactives', () => {
    const ids = gearAdvice([c('a', 650), c('b', 20, { breakInKm: 50 }), c('c', 900, { active: false })]).map((e) => e.ruleId);
    expect(ids).toEqual(['gear.wear', 'gear.breakin']);
  });
});
