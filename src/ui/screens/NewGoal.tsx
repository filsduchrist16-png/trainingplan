import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { m, AnimatePresence } from 'motion/react';
import {
  GOALS, addDays, buildWeekSessions, formatPace, generatePlan, pacesFromVdot, predictRaceTime, toIsoDate, vdotFromRace, vdotFromVma,
  isPlausibleVdot, zonesFromHrMax,
  type Athlete, type Availability, type BodyZone, type CrossTraining, type Difficulty, type Experience, type GoalKind, type PlanRequest, type Weekday,
} from '@/engine';
import { db } from '@/data/db';
import { updateAthlete } from '@/data/athlete';
import { createPlan, phaseWeekIndex, startingPoint } from '@/data/planner';
import { stamp } from '@/data/ids';
import { Button } from '@/ui/components/Button';
import { Card, Eyebrow } from '@/ui/components/Card';
import { ChoiceCard, ChoiceGroup, Chip, Field, Segmented, Stepper, TextInput } from '@/ui/components/forms';
import { PlanTimeline } from '@/ui/components/PlanTimeline';
import { Why } from '@/ui/components/Why';
import { useActiveAthlete } from '@/ui/hooks/useAthlete';
import { cn } from '@/ui/lib/cn';

const DAYS: { d: Weekday; short: string }[] = [
  { d: 1, short: 'Lun' }, { d: 2, short: 'Mar' }, { d: 3, short: 'Mer' }, { d: 4, short: 'Jeu' }, { d: 5, short: 'Ven' }, { d: 6, short: 'Sam' }, { d: 7, short: 'Dim' },
];
const STEPS = ['Objectif', 'Course', 'Expérience', 'Départ', 'Forme', 'Dispos', 'Options', 'Santé', 'Aperçu'] as const;
const PAIN_ZONES: { z: BodyZone; label: string }[] = [
  { z: 'tibia_g', label: 'Tibia G' }, { z: 'tibia_d', label: 'Tibia D' }, { z: 'achille_g', label: 'Achille G' }, { z: 'achille_d', label: 'Achille D' },
  { z: 'genou_g', label: 'Genou G' }, { z: 'genou_d', label: 'Genou D' }, { z: 'itb_g', label: 'Bandelette G' }, { z: 'itb_d', label: 'Bandelette D' },
  { z: 'pied_g', label: 'Pied G' }, { z: 'pied_d', label: 'Pied D' }, { z: 'hanche_g', label: 'Hanche G' }, { z: 'dos', label: 'Dos' },
];
const REF_DISTANCES = [{ km: 5, label: '5 km' }, { km: 10, label: '10 km' }, { km: 21.0975, label: 'Semi' }, { km: 42.195, label: 'Marathon' }];

interface State {
  goal?: GoalKind;
  hasRace: boolean;
  raceName: string;
  raceDate: string;
  raceKm: number;
  raceGain: number;
  durationWeeks: number;
  experience: Experience;
  currentKm: number;
  longestKm: number;
  /** Minutes courues d'une traite ; undefined = je ne sais pas. */
  continuousMin?: number;
  fitnessMode: 'temps' | 'vma' | 'inconnu';
  refKm: number;
  refTime: string;
  vma: number;
  availability: Availability;
  difficulty: Difficulty;
  hasPoles: boolean;
  localVertical: Athlete['localVertical'];
  crossTraining: CrossTraining[];
  pastInjuries: BodyZone[];
  currentPain?: { zone: BodyZone; intensity: number };
  hrMax: number;
  hrMaxTested: boolean;
  hrRest: number;
}

/** « 22:30 » → 22,5 min ; « 1:45:00 » → 105 min. */
export function timeToMinutes(s: string): number | null {
  const parts = s.trim().split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  const [h, mi, se] = parts.length === 3 ? parts : [0, ...parts];
  const total = h! * 60 + mi! + se! / 60;
  return total > 0 ? total : null;
}

export function NewGoal() {
  const athlete = useActiveAthlete();
  if (!athlete) return null;
  return <Wizard athlete={athlete} />;
}

function Wizard({ athlete }: { athlete: Athlete }) {
  const navigate = useNavigate();
  const today = toIsoDate(new Date());
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fromHistory, setFromHistory] = useState(false);
  const [s, setS] = useState<State>(() => ({
    hasRace: true,
    raceName: '',
    raceDate: addDays(today, 16 * 7),
    raceKm: 10,
    raceGain: 0,
    durationWeeks: 10,
    experience: athlete.experience,
    currentKm: 0,
    longestKm: 0,
    fitnessMode: athlete.vdot ? 'temps' : 'inconnu',
    refKm: 10,
    refTime: '',
    vma: 14,
    availability: athlete.availability,
    difficulty: 'equilibre',
    hasPoles: athlete.hasPoles,
    localVertical: athlete.localVertical,
    crossTraining: athlete.crossTraining,
    pastInjuries: athlete.injuries.map((i) => i.zone),
    hrMax: athlete.hrMax,
    hrMaxTested: athlete.hrMaxSource === 'test',
    hrRest: athlete.hrRest,
  }));
  const set = (patch: Partial<State>) => setS((prev) => ({ ...prev, ...patch }));

  // Point de départ pré-rempli depuis l'historique importé.
  useEffect(() => {
    void startingPoint(db, athlete.id, today).then((sp) => {
      if (!sp.hasHistory) return;
      setFromHistory(true);
      setS((prev) => ({ ...prev, currentKm: Math.max(sp.currentWeeklyKm, ...sp.recentWeeksKm), longestKm: sp.longestRecentRunKm }));
    });
  }, [athlete.id, today]);

  const profile = s.goal ? GOALS[s.goal] : undefined;
  const raceGoal = profile && (profile.family === 'route' || profile.family === 'trail');
  const vdot = useMemo(() => {
    if (s.fitnessMode === 'vma') return vdotFromVma(s.vma);
    if (s.fitnessMode === 'temps') {
      const min = timeToMinutes(s.refTime);
      return min ? vdotFromRace(s.refKm, min) : athlete.vdot;
    }
    return undefined;
  }, [s.fitnessMode, s.vma, s.refTime, s.refKm, athlete.vdot]);
  const validVdot = vdot && isPlausibleVdot(vdot) ? Math.round(vdot * 10) / 10 : undefined;

  const request: PlanRequest | undefined = s.goal
    ? {
        goal: s.goal,
        startDate: today,
        ...(raceGoal && s.hasRace ? { race: { date: s.raceDate, distanceKm: s.raceKm, elevationGainM: profile!.family === 'trail' ? s.raceGain : 0 } } : { durationWeeks: s.durationWeeks }),
        experience: s.experience,
        difficulty: s.difficulty,
        currentWeeklyKm: s.currentKm,
        ...(s.longestKm ? { longestRecentRunKm: s.longestKm } : {}),
        ...(s.continuousMin !== undefined ? { continuousMin: s.continuousMin } : {}),
        availability: s.availability,
        ...(validVdot ? { vdot: validVdot } : {}),
      }
    : undefined;
  const preview = request && step === STEPS.length - 1 ? generatePlan(request) : undefined;

  const canNext = [
    Boolean(s.goal),
    !raceGoal || !s.hasRace || (s.raceDate > today && s.raceKm > 0),
    true,
    true,
    s.fitnessMode !== 'temps' || Boolean(validVdot),
    s.availability.allowedDays.length >= Math.min(2, s.availability.runDaysPerWeek),
    true,
    true,
    Boolean(preview?.ok),
  ][step];

  function chooseGoal(goal: GoalKind) {
    const p = GOALS[goal];
    set({ goal, raceKm: p.defaultDistanceKm, raceGain: p.defaultElevationM, hasRace: p.family === 'route' || p.family === 'trail', durationWeeks: p.idealWeeks, raceDate: addDays(today, p.idealWeeks * 7 - 1) });
    if (goal === 'debuter') set({ experience: 'jamais' });
  }

  async function create() {
    if (!request) return;
    setBusy(true);
    try {
      const zones = zonesFromHrMax(s.hrMax);
      await updateAthlete(db, athlete.id, {
        experience: s.experience,
        availability: s.availability,
        hasPoles: s.hasPoles,
        localVertical: s.localVertical,
        crossTraining: s.crossTraining,
        hrMax: s.hrMax,
        hrMaxSource: s.hrMaxTested ? 'test' : 'estimee',
        hrRest: s.hrRest,
        zones: athlete.zones.mode === 'manuel' && athlete.hrMax === s.hrMax ? athlete.zones : { mode: 'auto', bounds: zones },
        ...(validVdot ? { vdot: validVdot, vdotSource: s.fitnessMode === 'vma' ? 'vma' : 'course' } : {}),
        injuries: [
          ...athlete.injuries.filter((i) => s.pastInjuries.includes(i.zone)),
          ...s.pastInjuries.filter((z) => !athlete.injuries.some((i) => i.zone === z)).map((zone) => ({ zone, label: PAIN_ZONES.find((p) => p.z === zone)?.label ?? zone, status: 'dormante' as const })),
        ],
      });
      if (s.currentPain && s.currentPain.intensity > 0) {
        await db.painLogs.add(stamp({ athleteId: athlete.id, date: today, zone: s.currentPain.zone, intensity: s.currentPain.intensity, when: 'matin' as const }));
      }
      const fresh = (await db.athletes.get(athlete.id))!;
      const r = await createPlan(db, fresh, { request, raceName: s.raceName.trim() || undefined }, today);
      if (r.ok) navigate('/', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[85dvh] flex-col gap-5">
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => (step === 0 ? navigate(-1) : setStep(step - 1))} className="text-sm text-muted hover:text-text">
            ← {step === 0 ? 'Annuler' : 'Retour'}
          </button>
          <span className="num text-xs text-muted">{step + 1} / {STEPS.length}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label="Progression">
          <m.div className="h-full bg-accent" animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </header>

      <AnimatePresence mode="wait">
        <m.section key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }} className="flex-1 space-y-5">
          {step === 0 && (
            <>
              <h1 className="text-3xl font-semibold">C'est quoi ton objectif?</h1>
              <ChoiceGroup label="Objectif">
                <Eyebrow className="mt-1">Route</Eyebrow>
                {(['route_5k', 'route_10k', 'route_semi', 'route_marathon'] as GoalKind[]).map((g) => (
                  <ChoiceCard key={g} selected={s.goal === g} onSelect={() => chooseGoal(g)} title={GOALS[g].label} subtitle={`${GOALS[g].minWeeks} à ${GOALS[g].idealWeeks}+ semaines`} />
                ))}
                <Eyebrow className="mt-3">Trail</Eyebrow>
                {(['trail_court', 'trail_moyen', 'ultra'] as GoalKind[]).map((g) => (
                  <ChoiceCard key={g} selected={s.goal === g} onSelect={() => chooseGoal(g)} title={GOALS[g].label} subtitle="D+ pris en compte, côtes et descentes" />
                ))}
                <Eyebrow className="mt-3">Autre</Eyebrow>
                <ChoiceCard selected={s.goal === 'debuter'} onSelect={() => chooseGoal('debuter')} title="Courir de zéro" subtitle="Marche-course progressive jusqu'à 30 min continues" />
                <ChoiceCard selected={s.goal === 'forme'} onSelect={() => chooseGoal('forme')} title="Garder la forme" subtitle="Sans course : régularité et maintien" />
              </ChoiceGroup>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="text-3xl font-semibold">{raceGoal ? 'Ta course' : 'Combien de temps?'}</h1>
              {raceGoal && (
                <Segmented label="Course précise" value={s.hasRace ? 'oui' : 'non'} onChange={(v) => set({ hasRace: v === 'oui' })} options={[{ value: 'oui', label: "J'ai une date" }, { value: 'non', label: 'Pas encore' }]} />
              )}
              {raceGoal && s.hasRace ? (
                <div className="space-y-4">
                  <Field label="Nom (optionnel)"><TextInput value={s.raceName} onChange={(e) => set({ raceName: e.target.value })} placeholder="Ex. Trail du Grand-Duc" /></Field>
                  <Field label="Date" hint={s.raceDate <= today ? 'La date doit être dans le futur.' : undefined}><TextInput type="date" value={s.raceDate} min={addDays(today, 1)} onChange={(e) => set({ raceDate: e.target.value })} /></Field>
                  <Stepper label="Distance" value={s.raceKm} onChange={(v) => set({ raceKm: v })} step={profile!.family === 'trail' ? 1 : 0.1} min={1} max={250} unit="km" />
                  {profile!.family === 'trail' && <Stepper label="Dénivelé positif" value={s.raceGain} onChange={(v) => set({ raceGain: v })} step={50} max={15000} unit="m D+" />}
                </div>
              ) : (
                <Stepper label="Durée du plan" value={s.durationWeeks} onChange={(v) => set({ durationWeeks: v })} min={4} max={24} unit="sem." />
              )}
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-3xl font-semibold">Ton expérience en course?</h1>
              <ChoiceGroup label="Expérience">
                <ChoiceCard selected={s.experience === 'jamais'} onSelect={() => set({ experience: 'jamais' })} title="Je n'ai jamais couru" subtitle="Ou pas depuis longtemps" />
                <ChoiceCard selected={s.experience === 'debutant'} onSelect={() => set({ experience: 'debutant' })} title="Débutant" subtitle="Moins d'un an, quelques sorties par semaine" />
                <ChoiceCard selected={s.experience === 'regulier'} onSelect={() => set({ experience: 'regulier' })} title="Régulier" subtitle="Je cours toute l'année, déjà fait des courses" />
                <ChoiceCard selected={s.experience === 'avance'} onSelect={() => set({ experience: 'avance' })} title="Avancé" subtitle="Volume élevé, entraînement structuré" />
              </ChoiceGroup>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="text-3xl font-semibold">D'où tu pars</h1>
              <p className="text-muted">Ton volume <strong>actuel</strong>, pas celui que tu voudrais. Le plan monte d'au plus 10 % par semaine à partir de là.</p>
              {fromHistory && <p className="rounded-xl bg-ok/10 p-3 text-sm text-ok">Pré-rempli à partir de ton historique importé.</p>}
              <Stepper label="Volume par semaine" value={s.currentKm} onChange={(v) => set({ currentKm: v })} max={250} unit="km" />
              <Field label="Combien de temps peux-tu courir sans t'arrêter ni marcher?" hint="C'est ça qui décide si on commence par de la marche-course. Pas sûr? Choisis le plus bas." group>
                <div className="flex flex-wrap gap-2">
                  {([[undefined, 'Je sais pas'], [3, 'Moins de 5 min'], [8, '5 à 10 min'], [15, '10 à 20 min'], [25, '20 à 30 min'], [40, '30 min et +']] as [number | undefined, string][]).map(([v, label]) => (
                    <Chip key={label} selected={s.continuousMin === v} onToggle={() => set({ continuousMin: v })}>{label}</Chip>
                  ))}
                </div>
              </Field>
              <Stepper label="Plus longue sortie récente" value={s.longestKm} onChange={(v) => set({ longestKm: v })} step={0.5} max={100} unit="km" />
              <p className="text-xs text-muted">Ta plus longue course d'une traite, en km. C'est elle qui limite la longueur de <em>chaque</em> sortie du plan : on l'allonge de ~10 % à la fois. Pas sûr? Mets une valeur un peu basse.</p>
              <Why>Partir de ton vrai volume, c'est la base de la prévention : os, tendons et périoste s'adaptent plus lentement que le cardio. Sous 10 km/sem, le plan commence par de la marche-course.</Why>
            </>
          )}

          {step === 4 && (
            <>
              <h1 className="text-3xl font-semibold">Ta forme actuelle</h1>
              <p className="text-muted">Ça fixe tes allures. Comme Runna : un seul repère, et toutes les séances s'ajustent.</p>
              <Segmented label="Repère" value={s.fitnessMode} onChange={(v) => set({ fitnessMode: v })} options={[{ value: 'temps', label: 'Un temps' }, { value: 'vma', label: 'Ma VMA' }, { value: 'inconnu', label: 'Je sais pas' }]} />
              {s.fitnessMode === 'temps' && (
                <div className="space-y-3">
                  <Segmented label="Distance de référence" value={s.refKm} onChange={(v) => set({ refKm: v })} options={REF_DISTANCES.map((r) => ({ value: r.km, label: r.label }))} />
                  <Field label="Ton temps récent" hint="Format mm:ss ou h:mm:ss, sur une course des 3 derniers mois.">
                    <TextInput inputMode="numeric" placeholder="ex. 52:30" value={s.refTime} onChange={(e) => set({ refTime: e.target.value })} />
                  </Field>
                </div>
              )}
              {s.fitnessMode === 'vma' && <Stepper label="VMA" value={s.vma} onChange={(v) => set({ vma: v })} step={0.5} min={8} max={25} unit="km/h" />}
              {s.fitnessMode === 'inconnu' && <p className="rounded-xl bg-surface-2 p-3 text-sm">Pas de souci : allures prudentes au départ, et un test de 3 km en semaine 2 pour calibrer.</p>}
              {validVdot && <PacePreview vdot={validVdot} />}
            </>
          )}

          {step === 5 && (
            <>
              <h1 className="text-3xl font-semibold">Ta semaine type</h1>
              <Field label="Sorties de course par semaine" group>
                <Segmented label="Sorties par semaine" value={s.availability.runDaysPerWeek} onChange={(v) => set({ availability: { ...s.availability, runDaysPerWeek: v } })} options={[2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))} />
              </Field>
              <Field label="Jours possibles" group>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(({ d, short }) => (
                    <Chip key={d} selected={s.availability.allowedDays.includes(d)} onToggle={() => {
                      const allowed = s.availability.allowedDays.includes(d) ? s.availability.allowedDays.filter((x) => x !== d) : [...s.availability.allowedDays, d].sort();
                      set({ availability: { ...s.availability, allowedDays: allowed as Weekday[], longRunDay: allowed.includes(s.availability.longRunDay) ? s.availability.longRunDay : (allowed.at(-1) ?? 6) as Weekday } });
                    }}>{short}</Chip>
                  ))}
                </div>
              </Field>
              <Field label="Jour de la sortie longue" group>
                <div className="flex flex-wrap gap-2">
                  {DAYS.filter(({ d }) => s.availability.allowedDays.includes(d)).map(({ d, short }) => (
                    <Chip key={d} selected={s.availability.longRunDay === d} onToggle={() => set({ availability: { ...s.availability, longRunDay: d } })}>{short}</Chip>
                  ))}
                </div>
              </Field>
              <Stepper label="Max en semaine" value={s.availability.maxWeekdayMinutes} onChange={(v) => set({ availability: { ...s.availability, maxWeekdayMinutes: v } })} step={15} min={20} max={180} unit="min" />
              <Stepper label="Max la fin de semaine" value={s.availability.maxWeekendMinutes} onChange={(v) => set({ availability: { ...s.availability, maxWeekendMinutes: v } })} step={15} min={30} max={480} unit="min" />
            </>
          )}

          {step === 6 && (
            <>
              <h1 className="text-3xl font-semibold">Options</h1>
              <Field label="Renforcement par semaine" group>
                <Segmented label="Renforcement" value={s.availability.strengthPerWeek} onChange={(v) => set({ availability: { ...s.availability, strengthPerWeek: v } })} options={[{ value: 0 as const, label: 'Aucun' }, { value: 1 as const, label: '1×' }, { value: 2 as const, label: '2×' }]} />
              </Field>
              <Field label="Difficulté" group>
                <ChoiceGroup label="Difficulté">
                  <ChoiceCard selected={s.difficulty === 'prudent'} onSelect={() => set({ difficulty: 'prudent' })} title="Prudent" subtitle="Volume de pointe plus bas, idéal en reprise ou si la vie est chargée" />
                  <ChoiceCard selected={s.difficulty === 'equilibre'} onSelect={() => set({ difficulty: 'equilibre' })} title="Équilibré" subtitle="Le bon dosage pour la plupart" />
                  <ChoiceCard selected={s.difficulty === 'ambitieux'} onSelect={() => set({ difficulty: 'ambitieux' })} title="Ambitieux" subtitle="Plus de volume et de qualité. La règle des 10 % reste la même." />
                </ChoiceGroup>
              </Field>
              <Field label="Terrain près de chez toi" group>
                <Segmented label="Terrain" value={s.localVertical} onChange={(v) => set({ localVertical: v })} options={[{ value: 'plat', label: 'Plat' }, { value: 'vallonne', label: 'Vallonné' }, { value: 'montagneux', label: 'Montagne' }]} />
              </Field>
              <Field label="Si la course doit être remplacée (blessure)" group>
                <div className="flex flex-wrap gap-2">
                  {([['velo', 'Vélo'], ['home_trainer', 'Home trainer'], ['natation', 'Natation'], ['elliptique', 'Elliptique']] as [CrossTraining, string][]).map(([c, label]) => (
                    <Chip key={c} selected={s.crossTraining.includes(c)} onToggle={() => set({ crossTraining: s.crossTraining.includes(c) ? s.crossTraining.filter((x) => x !== c) : [...s.crossTraining, c] })}>{label}</Chip>
                  ))}
                </div>
              </Field>
              {profile?.family === 'trail' && <Chip selected={s.hasPoles} onToggle={() => set({ hasPoles: !s.hasPoles })}>J'utilise des bâtons</Chip>}
            </>
          )}

          {step === 7 && (
            <>
              <h1 className="text-3xl font-semibold">Santé</h1>
              <Field label="Blessures passées (ça rend le plan plus prudent)" group>
                <div className="flex flex-wrap gap-2">
                  {PAIN_ZONES.map(({ z, label }) => (
                    <Chip key={z} selected={s.pastInjuries.includes(z)} onToggle={() => set({ pastInjuries: s.pastInjuries.includes(z) ? s.pastInjuries.filter((x) => x !== z) : [...s.pastInjuries, z] })}>{label}</Chip>
                  ))}
                </div>
              </Field>
              <Field label="Une douleur en ce moment?" group>
                <div className="flex flex-wrap gap-2">
                  <Chip selected={!s.currentPain} onToggle={() => set({ currentPain: undefined })}>Non</Chip>
                  {PAIN_ZONES.slice(0, 6).map(({ z, label }) => (
                    <Chip key={z} selected={s.currentPain?.zone === z} onToggle={() => set({ currentPain: { zone: z, intensity: s.currentPain?.intensity ?? 2 } })}>{label}</Chip>
                  ))}
                </div>
              </Field>
              {s.currentPain && <Stepper label="Intensité" value={s.currentPain.intensity} onChange={(v) => set({ currentPain: { ...s.currentPain!, intensity: v } })} max={10} unit="/ 10" />}
              <Stepper label="FC max" value={s.hrMax} onChange={(v) => set({ hrMax: v })} min={140} max={220} unit="bpm" />
              <Chip selected={s.hrMaxTested} onToggle={() => set({ hrMaxTested: !s.hrMaxTested })}>Mesurée lors d'un test</Chip>
              <Stepper label="FC repos" value={s.hrRest} onChange={(v) => set({ hrRest: v })} min={30} max={100} unit="bpm" />
            </>
          )}

          {step === 8 && request && preview && <Preview request={request} preview={preview} athlete={athlete} onPostpone={() => setStep(1)} />}
        </m.section>
      </AnimatePresence>

      <footer className="sticky bottom-24 pt-2">
        {step < STEPS.length - 1 ? (
          <Button size="lg" className="w-full" disabled={!canNext} onClick={() => setStep(step + 1)}>Continuer</Button>
        ) : (
          <Button size="lg" className="w-full" disabled={!canNext || busy} onClick={create}>{busy ? 'Création…' : 'Créer mon plan'}</Button>
        )}
      </footer>
    </div>
  );
}

function PacePreview({ vdot }: { vdot: number }) {
  const p = pacesFromVdot(vdot);
  const rows: [string, number][] = [['Facile', p.E], ['Marathon', p.M], ['Seuil', p.T], ['Intervalles', p.I]];
  return (
    <Card className="space-y-2">
      <Eyebrow>Tes allures (niveau {vdot})</Eyebrow>
      <dl className="grid grid-cols-2 gap-2">
        {rows.map(([label, pace]) => (
          <div key={label} className="rounded-xl bg-surface-2 p-3">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="num text-xl font-semibold">{formatPace(pace)}<span className="text-sm text-muted"> /km</span></dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted">Prédiction 10 km : {formatTime(predictRaceTime(vdot, 10))} · semi : {formatTime(predictRaceTime(vdot, 21.0975))} (route plate, bonnes conditions).</p>
    </Card>
  );
}

function formatTime(min: number): string {
  const h = Math.floor(min / 60);
  const mm = Math.floor(min % 60);
  const ss = Math.round((min * 60) % 60);
  return h ? `${h}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
}

function Preview({ request, preview, athlete, onPostpone }: { request: PlanRequest; preview: ReturnType<typeof generatePlan>; athlete: Athlete; onPostpone: () => void }) {
  const first = preview.weeks[0];
  const firstWeek = first
    ? buildWeekSessions(first, {
        goal: request.goal, family: preview.family, availability: request.availability, experience: request.experience, vdot: request.vdot,
        hrMaxEstimated: athlete.hrMaxSource === 'estimee', hasPoles: athlete.hasPoles, planWeek: 0, runWalkStage: preview.start?.stage, phaseWeek: phaseWeekIndex(preview.weeks, 0),
        ...(request.race ? { race: { date: request.race.date, distanceKm: request.race.distanceKm } } : {}), fromDate: request.startDate,
      }).sessions.filter((x) => x.type !== 'repos')
    : [];
  if (!preview.ok) {
    return (
      <Card>
        <h1 className="text-2xl">{preview.warnings[0]?.title}</h1>
        <p className="mt-2 text-muted">{preview.warnings[0]?.why}</p>
      </Card>
    );
  }
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold">Ton plan</h1>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="semaines" value={preview.weeks.length} />
        <Stat label="km/sem au pic" value={preview.peakKm} />
        <Stat label="km/sem au départ" value={preview.weeks[0]!.targetKm} />
      </div>
      <Card>
        <PlanTimeline weeks={preview.weeks} />
      </Card>
      {preview.warnings.map((w) => (
        <div key={w.ruleId} className={cn('rounded-xl p-3 text-sm', w.severity === 'attention' ? 'bg-warn/12 text-warn' : 'bg-surface-2')}>
          <strong>{w.title}.</strong> <span className="text-muted">{w.why}</span>
        </div>
      ))}
      {preview.options && (
        <Card className="space-y-3">
          <Eyebrow>Deux bonnes options</Eyebrow>
          <p className="text-sm text-muted">Le plan ci-dessus te fait courir l'épreuve en marche/course : c'est une vraie stratégie, et la plus sûre. Tu peux aussi choisir une date plus lointaine.</p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-accent/15 px-3 py-2 text-sm text-text">✓ Courir en marche/course</span>
            <Button variant="outline" size="sm" onClick={onPostpone}>Décaler l'objectif</Button>
          </div>
        </Card>
      )}
      <Card>
        <Eyebrow>Ta première semaine</Eyebrow>
        <ul className="mt-3 space-y-2">
          {firstWeek.map((x) => (
            <li key={x.date + x.type} className="flex justify-between gap-2 text-sm">
              <span><span className="num text-muted">{x.date.slice(5)}</span> · {x.title}</span>
              {x.isKey && <span className="text-accent">clé</span>}
            </li>
          ))}
        </ul>
      </Card>
      <Why>Le plan suit une périodisation : base aérobie d'abord, intensité spécifique ensuite, décharge toutes les 3-4 semaines et affûtage avant la course. Chaque séance aura son « pourquoi ».</Why>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-surface p-3">
      <p className="num text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
