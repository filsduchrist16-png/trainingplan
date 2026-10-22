import { useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { gearAdvice, shoeStatus, type Athlete, type Terrain } from '@/engine';
import { db } from '@/data/db';
import { addShoe, setShoeActive, shoesWithKm } from '@/data/gear';
import { Button } from '@/ui/components/Button';
import { Card, Eyebrow } from '@/ui/components/Card';
import { Field, Segmented, Stepper, TextInput } from '@/ui/components/forms';
import { useActiveAthlete } from '@/ui/hooks/useAthlete';
import { cn } from '@/ui/lib/cn';

const STATE_LABEL = { rodage: 'En rodage', ok: 'En forme', usure: 'Bientôt usée', retraite: 'À remplacer' } as const;
const STATE_COLOR = { rodage: 'bg-z2', ok: 'bg-ok', usure: 'bg-warn', retraite: 'bg-danger' } as const;

/** Équipement : km par paire, rodage, usure, conseils de rotation (calculés par le moteur). */
export function Equipement() {
  const athlete = useActiveAthlete();
  if (!athlete) return null;
  return <EquipementFor key={athlete.id} athlete={athlete} />;
}

function EquipementFor({ athlete }: { athlete: Athlete }) {
  const shoes = useLiveQuery(() => shoesWithKm(db, athlete.id), [athlete.id]);
  const [adding, setAdding] = useState(false);
  if (!shoes) return null;
  const advice = gearAdvice(shoes);
  return (
    <div className="space-y-5">
      <Link to="/plus" className="text-sm text-muted hover:text-text">← Plus</Link>
      <h1 className="text-3xl font-semibold">Équipement</h1>

      {advice.map((a) => (
        <div key={a.ruleId + a.title} className={cn('rounded-xl p-3 text-sm', a.severity === 'attention' ? 'bg-warn/12 text-warn' : 'bg-surface-2')}>
          <strong>{a.title}.</strong> <span className="text-muted">{a.why}</span>
        </div>
      ))}

      <ul className="space-y-3">
        {shoes.map(({ shoe, km }) => {
          const st = shoeStatus(shoe, km);
          return (
            <li key={shoe.id}>
              <Card className={cn('space-y-2', !shoe.active && 'opacity-60')}>
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold">{shoe.name}</h2>
                  <span className="text-xs text-muted">{shoe.active ? STATE_LABEL[st.state] : 'Retirée'}</span>
                </div>
                {shoe.model && <p className="text-sm text-muted">{shoe.model}</p>}
                <div role="progressbar" aria-label={`${shoe.name} : ${st.km} km sur ${shoe.retireKm}`} aria-valuemin={0} aria-valuemax={shoe.retireKm} aria-valuenow={st.km} className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className={cn('h-full', STATE_COLOR[st.state])} style={{ width: `${Math.min(100, st.usedShare * 100)}%` }} />
                </div>
                <p className="num text-sm text-muted">{st.km} km sur {shoe.retireKm}{st.remainingKm > 0 ? ` · reste ~${st.remainingKm} km` : ''}</p>
                <Button size="sm" variant="outline" onClick={() => void setShoeActive(db, shoe.id, !shoe.active)}>{shoe.active ? 'Retirer de la rotation' : 'Remettre en rotation'}</Button>
              </Card>
            </li>
          );
        })}
      </ul>

      {adding ? <AddShoe athleteId={athlete.id} onDone={() => setAdding(false)} /> : <Button onClick={() => setAdding(true)}>Ajouter une paire</Button>}
    </div>
  );
}

function AddShoe({ athleteId, onDone }: { athleteId: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [used, setUsed] = useState(false);
  const [km, setKm] = useState(0);
  const [terrain, setTerrain] = useState<Terrain>('route');
  return (
    <Card className="space-y-4">
      <Eyebrow>Nouvelle paire</Eyebrow>
      <Field label="Nom"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Peregrine 15" /></Field>
      <Field label="Modèle (optionnel)"><TextInput value={model} onChange={(e) => setModel(e.target.value)} placeholder="Ex. Saucony Peregrine 15" /></Field>
      <Segmented label="État" value={used ? 'usagee' : 'neuve'} onChange={(v) => setUsed(v === 'usagee')} options={[{ value: 'neuve', label: 'Neuve (rodage)' }, { value: 'usagee', label: 'Déjà portée' }]} />
      {used && <Stepper label="Km déjà faits" value={km} onChange={setKm} step={10} max={2000} unit="km" />}
      <Segmented label="Terrain" value={terrain} onChange={setTerrain} options={[{ value: 'route', label: 'Route' }, { value: 'sentier', label: 'Sentier' }, { value: 'mixte', label: 'Mixte' }]} />
      <div className="flex gap-2">
        <Button disabled={!name.trim()} onClick={async () => { await addShoe(db, athleteId, { name, model, initialKm: used ? km : 0, terrain }); onDone(); }}>Enregistrer</Button>
        <Button variant="outline" onClick={onDone}>Annuler</Button>
      </div>
    </Card>
  );
}
