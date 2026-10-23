import { SESSION_LIBRARY, type SessionType } from '@/engine';

/** Couleur d'une séance selon sa catégorie (cohérente avec les zones). */
export function sessionColor(type: SessionType): string {
  const c = SESSION_LIBRARY[type].category;
  return {
    repos: 'var(--line)',
    facile: 'var(--z2)',
    qualite: 'var(--z4)',
    longue: 'var(--z3)',
    force: 'var(--text-muted)',
    croise: 'var(--z1)',
    test: 'var(--z5)',
    course: 'var(--accent)',
  }[c];
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}
