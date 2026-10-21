import type { ReactNode } from 'react';
import { cn } from '@/ui/lib/cn';

/**
 * « Pourquoi? » dépliable : chaque recommandation du moteur en a un.
 * <details> natif : clavier, lecteur d'écran et sans JS.
 */
export function Why({ children, label = 'Pourquoi?', className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <details className={cn('group text-sm', className)}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-muted hover:text-text [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="transition group-open:rotate-90">›</span>
        {label}
      </summary>
      <div className="mt-2 border-l-2 border-accent/60 pl-3 text-muted leading-relaxed">{children}</div>
    </details>
  );
}
