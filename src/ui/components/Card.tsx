import type { HTMLAttributes } from 'react';
import { cn } from '@/ui/lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('rounded-[var(--radius-card)] bg-surface p-5 border border-line/60', className)} {...props} />;
}

export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs font-semibold uppercase tracking-[0.12em] text-muted', className)} {...props} />;
}
