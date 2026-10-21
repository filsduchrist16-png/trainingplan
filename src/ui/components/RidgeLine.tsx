/** Ligne de crête décorative (signature visuelle de Sentier). */
export function RidgeLine({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 48" fill="none" aria-hidden className={className}>
      <path
        d="M2 40 L22 26 L32 32 L52 12 L70 28 L84 20 L104 36 L122 18 L138 26 L158 14"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M2 46 C40 41 90 44 158 38" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
