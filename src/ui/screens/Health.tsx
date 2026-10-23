import { useState } from 'react';
import { Link } from 'react-router';
import { toIsoDate, type Athlete, type HealthProfile } from '@/engine';
import { db } from '@/data/db';
import { updateAthlete } from '@/data/athlete';
import { Button } from '@/ui/components/Button';
import { HealthForm, emptyHealth, stampHealth, type BodyStats } from '@/ui/components/HealthForm';
import { useActiveAthlete } from '@/ui/hooks/useAthlete';

/** Réglages : questionnaire santé (à refaire tous les 12 mois, ou dès qu'une réponse change). */
export function Health() {
  const athlete = useActiveAthlete();
  if (!athlete) return null;
  return <HealthFor key={athlete.id} athlete={athlete} />;
}

function HealthFor({ athlete }: { athlete: Athlete }) {
  const today = toIsoDate(new Date());
  const [health, setHealth] = useState<HealthProfile>(athlete.health ?? emptyHealth(today));
  const [body, setBody] = useState<BodyStats>({ birthYear: athlete.birthYear, heightCm: athlete.heightCm, weightKg: athlete.weightKg });
  const [saved, setSaved] = useState(false);
  async function save() {
    await updateAthlete(db, athlete.id, { health: stampHealth(health, athlete.health, today), ...body });
    setSaved(true);
  }
  return (
    <div className="space-y-5">
      <Link to="/plus" className="text-sm text-muted hover:text-text">← Plus</Link>
      <h1 className="text-3xl font-semibold">Questionnaire santé</h1>
      {athlete.health && <p className="text-sm text-muted">Dernières réponses : {athlete.health.answeredAt}. À refaire tous les 12 mois, ou dès que quelque chose change.</p>}
      <HealthForm health={health} onChange={(h) => { setHealth(h); setSaved(false); }} body={body} onBodyChange={(b) => { setBody(b); setSaved(false); }} today={today} />
      <Button size="lg" className="w-full" onClick={save}>{saved ? 'Enregistré' : 'Enregistrer'}</Button>
    </div>
  );
}
