/** Thin teal wave line, the platform's divider motif (§14). */
export function Wave({ className }: { className?: string }) {
  return (
    <svg
      className={`wave ${className ?? ''}`}
      viewBox="0 0 320 12"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0 6 C 20 0, 40 12, 60 6 S 100 0, 120 6 S 160 12, 180 6 S 220 0, 240 6 S 280 12, 300 6 S 320 4, 320 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
