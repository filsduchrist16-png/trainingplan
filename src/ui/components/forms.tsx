import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/ui/lib/cn';

/** Carte de choix (radio) : grande cible tactile, à la Runna. */
export function ChoiceCard({ selected, onSelect, title, subtitle, icon, className }: {
  selected: boolean;
  onSelect: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition',
        selected ? 'border-accent bg-accent/12 ring-1 ring-accent' : 'border-line bg-surface hover:border-muted',
        className,
      )}
    >
      {icon && <span aria-hidden className="text-2xl">{icon}</span>}
      <span className="flex-1">
        <span className="block font-medium">{title}</span>
        {subtitle && <span className="mt-0.5 block text-sm text-muted">{subtitle}</span>}
      </span>
      <span aria-hidden className={cn('h-5 w-5 rounded-full border-2', selected ? 'border-accent bg-accent' : 'border-line')} />
    </button>
  );
}

export function ChoiceGroup({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('grid gap-2', className)}>
      {children}
    </div>
  );
}

/** Contrôle segmenté (petites listes de valeurs). */
export function Segmented<T extends string | number>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full border border-line bg-surface p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('num h-10 flex-1 rounded-full text-sm font-medium transition', value === o.value ? 'bg-accent text-accent-ink' : 'text-muted hover:text-text')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Saisie numérique avec − / +. */
export function Stepper({ label, value, onChange, step = 1, min = 0, max = 999, unit }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)));
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`${label} : moins`} onClick={() => set(value - step)} className="h-10 w-10 rounded-full bg-surface-2 text-xl hover:bg-line">−</button>
        <input
          aria-label={label}
          inputMode="decimal"
          className="num w-16 bg-transparent text-center text-xl font-semibold outline-none"
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value.replace(',', '.'));
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
        />
        <button type="button" aria-label={`${label} : plus`} onClick={() => set(value + step)} className="h-10 w-10 rounded-full bg-surface-2 text-xl hover:bg-line">+</button>
        {unit && <span className="w-12 text-sm text-muted">{unit}</span>}
      </div>
    </div>
  );
}

export function Chip({ selected, onToggle, children }: { selected: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn('h-10 rounded-full border px-4 text-sm transition', selected ? 'border-accent bg-accent/15 text-text' : 'border-line text-muted hover:text-text')}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('num h-12 w-full rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-accent', className)} {...props} />;
}
