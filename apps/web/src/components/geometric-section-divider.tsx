export function GeometricSectionDivider({ flip = false }: { flip?: boolean }) {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-6xl overflow-hidden px-4 md:px-8">
      <svg viewBox="0 0 1200 48" preserveAspectRatio="none" focusable="false" className={`h-8 w-full md:h-12 ${flip ? '-scale-x-100' : ''}`}>
        <path d="M0 24H128L152 8L176 24H344L368 40L392 24H560L584 8L608 24H776L800 40L824 24H992L1016 8L1040 24H1200" fill="none" stroke="var(--color-accent-border)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <circle cx="152" cy="8" r="5" fill="var(--color-accent)" />
        <circle cx="368" cy="40" r="5" fill="var(--color-brand-secondary)" />
        <circle cx="584" cy="8" r="5" fill="var(--color-accent)" />
        <circle cx="800" cy="40" r="5" fill="var(--color-brand-secondary)" />
        <circle cx="1016" cy="8" r="5" fill="var(--color-accent)" />
      </svg>
    </div>
  );
}
