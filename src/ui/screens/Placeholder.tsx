import { EmptyState } from '@/ui/components/EmptyState';

export function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <EmptyState title="Bientôt">{text}</EmptyState>
    </div>
  );
}
