import type { ReactNode } from 'react';
import { RidgeLine } from './RidgeLine';

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[var(--radius-card)] border border-dashed border-line px-6 py-10 text-center">
      <RidgeLine className="h-12 w-40 text-muted" />
      <h2 className="text-xl">{title}</h2>
      {children && <p className="max-w-sm text-muted">{children}</p>}
      {action}
    </div>
  );
}
