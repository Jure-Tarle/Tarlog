export function BrandMark({ className }: { className?: string }): React.ReactElement {
  return (
    <span className={className ? `brand-mark ${className}` : "brand-mark"} aria-hidden>
      <svg viewBox="0 0 64 64" focusable="false">
        <path
          d="M45.1 41.2A16 16 0 1 1 45.1 22.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="5.7"
          strokeLinecap="round"
        />
        <path
          d="M27.6 24.1 32 32l9.8-4.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="5.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
