import type { RefObject } from 'react';
import { wipeSteps } from './apply.ts';

// The line between the camera's picture and the finished photo. It is
// dragged on the photo, or moved with the arrow keys once it has the focus.

const printed =
  'type-edge absolute top-2 rounded-[2px] bg-ground px-1.5 py-1 text-print';

export const Divider = ({
  dividerRef,
  rangeRef,
  onWipe,
}: {
  readonly dividerRef: RefObject<HTMLDivElement | null>;
  readonly rangeRef: RefObject<HTMLInputElement | null>;
  /** Moves it across the finished photo, from 0 to 1. */
  readonly onWipe: (share: number) => void;
}) => (
  <div
    className="pointer-events-none invisible absolute top-0 left-0 w-px bg-lamp shadow-[0_0_0_1px_var(--color-shade)]"
    ref={dividerRef}
  >
    <span className={`${printed} right-2.5`}>Camera</span>
    <span className={`${printed} left-2.5`}>Now</span>
    <input
      aria-label="How much of the camera's picture shows"
      className="peer -translate-1/2 pointer-events-none absolute top-1/2 left-1/2 h-10 w-11 opacity-0"
      defaultValue={wipeSteps / 2}
      max={wipeSteps}
      min={0}
      onChange={(event) => onWipe(Number(event.target.value) / wipeSteps)}
      ref={rangeRef}
      type="range"
    />
    <span className="-translate-1/2 pointer-events-auto absolute top-1/2 left-1/2 grid h-16 w-11 cursor-ew-resize place-items-center peer-focus-visible:[&>span]:outline-2 peer-focus-visible:[&>span]:outline-lamp peer-focus-visible:[&>span]:outline-offset-3">
      <span className="h-10 w-1.5 rounded-[2px] bg-lamp shadow-[0_0_0_1px_var(--color-shade)]" />
    </span>
  </div>
);
