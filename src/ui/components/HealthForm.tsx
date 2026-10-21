import { HEALTH_QUESTIONS, screen, type ChronicCondition, type HealthProfile, type HealthQuestion, type ISODate } from '@/engine';
import { cn } from '@/ui/lib/cn';
import { Chip, Field, Segmented, TextInput } from './forms';

export const EMPTY_ANSWERS: Record<HealthQuestion, boolean> = { q1: false, q2: false, q3: false, q4: false, q5: false, q6: false, q7: false, q8: false, q9: true };

export function emptyHealth(today: ISODate): HealthProfile {
  return { answers: { ...EMPTY_ANSWERS }, answeredAt: today, conditions: [] };
}

/**
 * Nouvelle version du questionnaire à enregistrer : la date de réponse ne change que si une réponse change
 * (une autorisation médicale antérieure ne couvre alors plus les nouvelles réponses).
 */
export function stampHealth(next: HealthProfile, previous: HealthProfile | undefined, today: ISODate): HealthProfile {
  const same = previous && JSON.stringify({ ...previous, answeredAt: '', clearance: '' }) === JSON.stringify({ ...next, answeredAt: '', clearance: '' });
  return { ...next, answeredAt: same ? previous.answeredAt : today };
}

export interface BodyStats {
  birthYear?: number;
  heightCm?: number;
  weightKg?: number;
}

const CONDITIONS: [ChronicCondition, string][] = [['diabete', 'Diabète'], ['asthme', 'Asthme'], ['renal', 'Maladie rénale'], ['autre', 'Autre']];
const ORDER: HealthQuestion[] = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9'];

/** Questionnaire santé : affiche les questions et ce que le moteur en conclut (screen), sans règle ici. */
export function HealthForm({ health, onChange, body, onBodyChange, today }: {
  health: HealthProfile;
  onChange: (h: HealthProfile) => void;
  body: BodyStats;
  onBodyChange: (b: BodyStats) => void;
  today: ISODate;
}) {
  const a = health.answers;
  const setAnswer = (q: HealthQuestion, v: boolean) => onChange({ ...health, answers: { ...a, [q]: v } });
  const result = screen({ ...health, answeredAt: today }, today);
  const needsClearance = a.q2 || a.q3 || a.q7;
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Année de naissance"><TextInput inputMode="numeric" placeholder="1985" value={body.birthYear ?? ''} onChange={(e) => onBodyChange({ ...body, birthYear: num(e.target.value) })} /></Field>
        <Field label="Taille (cm)"><TextInput inputMode="numeric" placeholder="170" value={body.heightCm ?? ''} onChange={(e) => onBodyChange({ ...body, heightCm: num(e.target.value) })} /></Field>
        <Field label="Poids (kg)"><TextInput inputMode="decimal" placeholder="70" value={body.weightKg ?? ''} onChange={(e) => onBodyChange({ ...body, weightKg: num(e.target.value) })} /></Field>
      </div>
      {ORDER.map((q) => (
        <div key={q} className="space-y-2">
          <p className="text-sm">{HEALTH_QUESTIONS[q]}</p>
          <Segmented label={HEALTH_QUESTIONS[q]} value={a[q] ? 'oui' : 'non'} onChange={(v) => setAnswer(q, v === 'oui')} options={[{ value: 'oui', label: 'Oui' }, { value: 'non', label: 'Non' }]} />
          {q === 'q4' && a.q4 && (
            <Field label="Lesquelles?" group>
              <div className="flex flex-wrap gap-2">
                {CONDITIONS.map(([c, label]) => (
                  <Chip key={c} selected={health.conditions.includes(c)} onToggle={() => onChange({ ...health, conditions: health.conditions.includes(c) ? health.conditions.filter((x) => x !== c) : [...health.conditions, c] })}>{label}</Chip>
                ))}
              </div>
            </Field>
          )}
          {q === 'q5' && a.q5 && (
            <Chip selected={Boolean(health.hrUnreliable)} onToggle={() => onChange({ ...health, hrUnreliable: !health.hrUnreliable })}>Il modifie ma fréquence cardiaque (ex. bêtabloquant)</Chip>
          )}
          {q === 'q8' && a.q8 && (
            <div className="space-y-2">
              <Segmented label="Situation" value={health.pregnancy?.status ?? 'enceinte'} onChange={(status) => onChange({ ...health, pregnancy: { status, dueOrBirthDate: health.pregnancy?.dueOrBirthDate ?? today } })} options={[{ value: 'enceinte', label: 'Enceinte' }, { value: 'post_partum', label: "J'ai accouché" }]} />
              <Field label={health.pregnancy?.status === 'post_partum' ? "Date de l'accouchement" : 'Date prévue'}>
                <TextInput type="date" value={health.pregnancy?.dueOrBirthDate ?? today} onChange={(e) => onChange({ ...health, pregnancy: { status: health.pregnancy?.status ?? 'enceinte', dueOrBirthDate: e.target.value } })} />
              </Field>
            </div>
          )}
        </div>
      ))}
      {needsClearance && (
        <Chip selected={Boolean(health.clearance)} onToggle={() => onChange({ ...health, clearance: health.clearance ? undefined : today })}>Un médecin m'autorise à courir</Chip>
      )}
      {result.explanations.map((e) => (
        <div key={e.ruleId} className={cn('rounded-xl p-3 text-sm', e.severity === 'stop' ? 'bg-danger/12 text-danger' : e.severity === 'attention' ? 'bg-warn/12 text-warn' : 'bg-surface-2')}>
          <strong>{e.title}.</strong> <span className="text-muted">{e.why}</span>
        </div>
      ))}
      <p className="text-xs text-muted">Tes réponses restent sur ton appareil. Ce questionnaire ne remplace pas un avis médical.</p>
    </div>
  );
}
