import { ChevronLeft, X } from 'lucide-react';
import { iconButton, quietButton } from '../ui/classes.ts';
import { Key, Meter } from '../ui/controls.tsx';

// What surrounds the photos while they are rated: the question, how far the
// owner has got, and what else can be done with the photo shown.

const iconSize = 20;

type HeadProps = {
  readonly question: string;
  readonly questionId: string;
  readonly questionRef: (element: HTMLHeadingElement | null) => void;
  /** How many moments are rated, and how many there are. */
  readonly rated: number;
  readonly total: number;
  readonly at: number;
  readonly onBack: () => void;
  readonly onClose: () => void;
};

export const RateHead = ({
  question,
  questionId,
  questionRef,
  rated,
  total,
  at,
  onBack,
  onClose,
}: HeadProps) => (
  <header className="flex shrink-0 flex-wrap items-center gap-x-2 px-1.5 sm:min-h-[52px] sm:px-3">
    <button
      aria-label="Back to the table"
      className={iconButton}
      onClick={onClose}
      title="Back to the table"
      type="button"
    >
      <X aria-hidden="true" size={iconSize} />
    </button>
    <h1
      aria-live="polite"
      className="type-name min-w-0 flex-1 px-2 text-[1.0625rem] text-lamp shadow-none outline-none max-sm:order-last max-sm:basis-full max-sm:px-3 max-sm:pb-2.5"
      id={questionId}
      ref={questionRef}
      tabIndex={-1}
    >
      {question}
    </h1>
    <button
      aria-keyshortcuts="Backspace"
      className={`${quietButton} h-10 px-1 text-sm max-sm:ml-auto`}
      disabled={at === 0}
      onClick={onBack}
      type="button"
    >
      <ChevronLeft aria-hidden="true" size={iconSize} />
      <span className="max-sm:sr-only">The moment before</span>
      <Key>Backspace</Key>
    </button>
    <p className="type-edge tabular flex shrink-0 items-center gap-3 px-2 text-quiet">
      <Meter
        className="w-20 sm:w-28"
        label={`${rated} of ${total} rated`}
        share={total === 0 ? 0 : rated / total}
      />
      <span>
        {Math.min(at + 1, total)} of {total}
      </span>
    </p>
  </header>
);

type ToolsProps = {
  /** How many photos the moment has. */
  readonly count: number;
  readonly isKept: boolean;
  readonly onAll: () => void;
  readonly onKeep: () => void;
  readonly onZoom: () => void;
};

const tool = `${quietButton} h-10 whitespace-nowrap rounded-[3px] px-2.5 text-sm hover:bg-raised`;

/** What can be done with the photo that is shown large. */
export const RateTools = ({
  count,
  isKept,
  onAll,
  onKeep,
  onZoom,
}: ToolsProps) => (
  <div className="flex flex-wrap items-center justify-center gap-x-2">
    {count > 1 ? (
      <>
        <button
          aria-keyshortcuts="Escape"
          className={tool}
          onClick={onAll}
          type="button"
        >
          All {count} photos <Key>Esc</Key>
        </button>
        <button
          aria-keyshortcuts="K"
          aria-pressed={isKept}
          className={tool}
          onClick={onKeep}
          type="button"
        >
          Keep too <Key>K</Key>
        </button>
      </>
    ) : null}
    <button
      aria-keyshortcuts="Z"
      className={tool}
      onClick={onZoom}
      type="button"
    >
      Full size <Key>Z</Key>
    </button>
  </div>
);
