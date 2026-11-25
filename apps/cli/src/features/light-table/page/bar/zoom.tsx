import { Minus, Plus } from 'lucide-react';
import type { RefObject } from 'react';
import { zoomSteps } from '../sheet/zoom.ts';
import { iconButton } from '../ui/classes.ts';

// How large the frames on the table are, from the whole shoot at once to
// one frame filling the window.

const iconSize = 16;

export const Zoom = ({
  rangeRef,
  onZoom,
  onStep,
}: {
  /** The slider, which is moved from outside while the table zooms. */
  readonly rangeRef: RefObject<HTMLInputElement | null>;
  /** Called with where the slider is, from 0 to 1. */
  readonly onZoom: (share: number) => void;
  readonly onStep: (direction: -1 | 1) => void;
}) => (
  <div className="flex shrink-0 items-center max-md:hidden">
    <button
      aria-keyshortcuts="-"
      aria-label="Smaller frames"
      className={iconButton}
      onClick={() => onStep(-1)}
      title="Smaller frames (−)"
      type="button"
    >
      <Minus aria-hidden="true" size={iconSize} />
    </button>
    <input
      aria-label="Size of the frames"
      className="w-24"
      data-rule={true}
      defaultValue={0}
      max={zoomSteps}
      min={0}
      onChange={(event) => onZoom(Number(event.target.value) / zoomSteps)}
      ref={rangeRef}
      type="range"
    />
    <button
      aria-keyshortcuts="+"
      aria-label="Larger frames"
      className={iconButton}
      onClick={() => onStep(1)}
      title="Larger frames (+)"
      type="button"
    >
      <Plus aria-hidden="true" size={iconSize} />
    </button>
  </div>
);
