import type { ReactNode } from 'react';

// The few kinds of control the page has. Everything that can be pressed is
// plain type on the table; nothing is a pill or a card.

/** The key that does the same as a button, printed small beside it. */
export const Key = ({ children }: { readonly children: ReactNode }) => (
  <kbd className="type-edge hidden rounded-[3px] border border-rule px-[5px] py-[2px] font-sans text-[0.625rem] text-quiet [@media(pointer:fine)]:inline-block">
    {children}
  </kbd>
);

/** A line of what the machine printed: small, narrow capitals. */
export const Print = ({
  children,
  className = '',
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) => <span className={`type-edge text-quiet ${className}`}>{children}</span>;

const whole = 100;

/** A thin line that fills as something gets done. */
export const Meter = ({
  share,
  label,
  className = '',
  tone = 'fill-lamp',
}: {
  /** How much is done, from 0 to 1. */
  readonly share: number;
  readonly label: string;
  readonly className?: string;
  /** The colour of what is done, as a class. */
  readonly tone?: string;
}) => (
  <svg
    aria-label={label}
    className={`block h-0.5 bg-raised ${className}`}
    preserveAspectRatio="none"
    role="img"
    viewBox={`0 0 ${whole} 1`}
  >
    <rect
      className={`${tone} transition-[width] duration-700 ease-out motion-reduce:transition-none`}
      height="1"
      width={Math.min(1, Math.max(0, share)) * whole}
    />
  </svg>
);
