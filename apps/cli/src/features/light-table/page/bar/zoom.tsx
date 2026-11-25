import { Minus, Plus } from 'lucide-react';
import type { KeyboardEvent, RefObject } from 'react';
import { zoomSteps } from '../sheet/zoom.ts';
import { iconButton } from '../ui/classes.ts';

// How large the frames on the table are, from the whole shoot at once to
// one frame filling the window. The table follows the slider while it is
// held, and comes to rest at the nearest size once it is let go.

const iconSize = 16;

const steps: ReadonlyMap<string, -1 | 1> = new Map([
  ['ArrowLeft', -1],
  ['ArrowDown', -1],
  ['ArrowRight', 1],
  ['ArrowUp', 1],
]);

export const Zoom = ({
  rangeRef,
  onZoom,
  onLetGo,
  onStep,
}: {
  /** The slider, which is moved from outside while the table zooms. */
  readonly rangeRef: RefObject<HTMLInputElement | null>;
  /** Called with where the slider is, from 0 to 1, while it is held. */
  readonly onZoom: (share: number) => void;
  readonly onLetGo: () => void;
  readonly onStep: (direction: -1 | 1) => void;
}) => {
  /** The arrow keys go from size to size, as the buttons do. */
  const onKeyDown = (event: KeyboardEvent) => {
    const step = steps.get(event.key);
    if (step !== undefined) {
      event.preventDefault();
      onStep(step);
    }
  };
  return (
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
        onBlur={onLetGo}
        onChange={(event) => onZoom(Number(event.target.value) / zoomSteps)}
        onKeyDown={onKeyDown}
        onPointerCancel={onLetGo}
        onPointerUp={onLetGo}
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
};
