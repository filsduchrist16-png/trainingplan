import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import { shoeStatus, suggestShoe } from '@/engine';
import { db } from '@/data/db';
import { shoesWithKm } from '@/data/gear';
import { Chip, Field } from './forms';

/** Choix de la paire portée : puces, avec les km et l'état de chaque paire. Rien si aucune paire n'est enregistrée. */
export function ShoePicker({ athleteId, value, onChange, trail = false, hard = false }: { athleteId: string; value?: string; onChange: (id: string | undefined) => void; trail?: boolean; hard?: boolean }) {
  const shoes = useLiveQuery(() => shoesWithKm(db, athleteId), [athleteId]);
  if (!shoes) return null;
  const active = shoes.filter((c) => c.shoe.active);
  const suggested = suggestShoe(shoes, { trail, hard })?.shoe.id; // ★ : la paire conseillée pour cette sortie
  if (!active.length) return <p className="text-xs text-muted">Pas de chaussures enregistrées : <Link to="/equipement" className="underline underline-offset-4">ajoute-les</Link> pour suivre leurs km.</p>;
  return (
    <Field label="Chaussures" group>
      <div className="flex flex-wrap gap-2">
        <Chip selected={!value} onToggle={() => onChange(undefined)}>Aucune</Chip>
        {active.map((c) => {
          const st = shoeStatus(c.shoe, c.km);
          return (
            <Chip key={c.shoe.id} selected={value === c.shoe.id} onToggle={() => onChange(c.shoe.id)}>
              {c.shoe.name} · {st.km} km{c.shoe.id === suggested ? ' ★' : ''}{st.state === 'retraite' ? ' (à remplacer)' : ''}
            </Chip>
          );
        })}
      </div>
    </Field>
  );
}
