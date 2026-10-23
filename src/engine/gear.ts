import { SHOE_ROTATION_MIN_KM, SHOE_WARN_REMAINING_SHARE } from './constants';
import { explain } from './explain';
import type { Explanation, Shoe, Terrain } from './types';

/**
 * Équipement : usure et rodage des chaussures, choix de la paire pour une sortie, rotation.
 * Les km d'une paire = km initiaux + km des sorties qui lui sont associées (calculés par la couche data).
 */

export type ShoeState = 'rodage' | 'ok' | 'usure' | 'retraite';

export interface ShoeStatus {
  shoeId: string;
  km: number;
  state: ShoeState;
  /** Part de la durée de vie utilisée (0-1+). */
  usedShare: number;
  remainingKm: number;
  explanation?: Explanation;
}

export function shoeStatus(shoe: Pick<Shoe, 'id' | 'name' | 'breakInKm' | 'retireKm'>, km: number): ShoeStatus {
  const usedShare = shoe.retireKm > 0 ? km / shoe.retireKm : 0;
  const remainingKm = Math.round(shoe.retireKm - km);
  const base = { shoeId: shoe.id, km: Math.round(km), usedShare: Math.round(usedShare * 1000) / 1000, remainingKm };
  if (km >= shoe.retireKm) {
    return { ...base, state: 'retraite', explanation: explain('gear.retire', 'attention', `${shoe.name} : à remplacer`, `${Math.round(km)} km au compteur (durée de vie visée : ${shoe.retireKm} km). L'amorti s'est tassé : le risque de blessure monte. Garde-la pour la marche et prépare la suivante.`, { km: Math.round(km), limite: shoe.retireKm }) };
  }
  if (remainingKm <= shoe.retireKm * SHOE_WARN_REMAINING_SHARE) {
    return { ...base, state: 'usure', explanation: explain('gear.wear', 'conseil', `${shoe.name} : bientôt usée`, `Il reste environ ${remainingKm} km avant ${shoe.retireKm} km. C'est le bon moment de racheter une paire et de la roder en alternance.`, { reste: remainingKm }) };
  }
  if (shoe.breakInKm > 0 && km < shoe.breakInKm) {
    return { ...base, state: 'rodage', explanation: explain('gear.breakin', 'info', `${shoe.name} : en rodage`, `${Math.round(km)} km sur ${shoe.breakInKm} de rodage. Courtes sorties faciles d'abord, puis tu la sors en séance dure ou en course seulement une fois rodée.`, { km: Math.round(km), rodage: shoe.breakInKm }) };
  }
  return { ...base, state: 'ok' };
}

export interface ShoeChoice {
  shoe: Shoe;
  km: number;
}

/**
 * Paire conseillée pour une sortie : paire active adaptée au terrain, jamais une paire à remplacer ni en rodage pour
 * une séance dure ou une course. Parmi les paires adaptées, la moins usée (la rotation se fait d'elle-même).
 */
export function suggestShoe(shoes: ShoeChoice[], opts: { trail: boolean; hard?: boolean }): ShoeChoice | undefined {
  const fits = (t: Terrain) => (opts.trail ? t !== 'route' : t !== 'sentier' && t !== 'technique');
  const usable = shoes.filter((c) => c.shoe.active && shoeStatus(c.shoe, c.km).state !== 'retraite');
  const ok = usable.filter((c) => !opts.hard || shoeStatus(c.shoe, c.km).state !== 'rodage');
  const byTerrain = ok.filter((c) => fits(c.shoe.terrain));
  const pool = byTerrain.length ? byTerrain : ok;
  return [...pool].sort((a, b) => a.km / Math.max(1, a.shoe.retireKm) - b.km / Math.max(1, b.shoe.retireKm))[0];
}

/** Conseils sur l'ensemble : paire à remplacer, usure, rodage, et rotation (alterner au moins 2 paires). */
export function gearAdvice(shoes: ShoeChoice[]): Explanation[] {
  const active = shoes.filter((c) => c.shoe.active);
  const out = active.flatMap((c) => shoeStatus(c.shoe, c.km).explanation ?? []);
  const total = active.reduce((s, c) => s + c.km, 0);
  if (active.length === 1 && total >= SHOE_ROTATION_MIN_KM) {
    out.push(explain('gear.rotation', 'conseil', 'Alterne deux paires', 'Une seule paire active : alterner deux paires varie les contraintes sur les tendons et laisse la mousse récupérer entre les sorties. Beaucoup de coureurs y gagnent en blessures évitées.', { paires: 1 }));
  }
  if (!active.length) out.push(explain('gear.none', 'info', 'Aucune paire enregistrée', 'Ajoute tes chaussures : Sentier compte leurs kilomètres et te prévient avant qu\'elles ne soient usées.'));
  return out;
}
