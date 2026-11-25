import { ChevronLeft, ChevronRight, PanelRight, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { chrome, iconButton } from '../ui/classes.ts';

// The strip above a photo: the way back to the table, which picture of the
// photo is shown, and the way to the photos beside it.

const iconSize = 20;

type Props = {
  /** Where the photo is among those gone through: "12 of 168". */
  readonly place: string;
  readonly hasBefore: boolean;
  readonly hasAfter: boolean;
  readonly isInfoShown: boolean;
  /** Whether it has made way for a photo that is looked at from close. */
  readonly isAside: boolean;
  /** Whether it lies on the photo, and needs a ground to be read on. */
  readonly isOnPhoto: boolean;
  readonly onClose: () => void;
  readonly onTurn: (direction: -1 | 1) => void;
  readonly onInfo: () => void;
  /** What is in the middle: which picture is shown, or where the photo stands. */
  readonly children: ReactNode;
};

export const Strip = ({
  place,
  hasBefore,
  hasAfter,
  isInfoShown,
  isAside,
  isOnPhoto,
  onClose,
  onTurn,
  onInfo,
  children,
}: Props) => (
  <header
    className={`${chrome} absolute top-0 left-0 z-10 flex h-[52px] items-center gap-x-1 px-1.5 sm:gap-x-2 sm:px-3 ${isAside ? 'pointer-events-none -translate-y-full opacity-0' : ''} ${isOnPhoto ? 'bg-ground' : ''}`}
    inert={isAside}
  >
    <button
      aria-keyshortcuts="Escape"
      aria-label="Back to the table"
      className={iconButton}
      onClick={onClose}
      title="Back to the table (Esc)"
      type="button"
    >
      <X aria-hidden="true" size={iconSize} />
    </button>
    <div className="flex h-10 min-w-0 flex-1 items-center">{children}</div>
    <p
      className={`type-edge tabular shrink-0 whitespace-nowrap px-1 text-quiet max-sm:absolute max-sm:top-full max-sm:right-2.5 ${isOnPhoto ? 'max-sm:hidden' : ''}`}
    >
      {place}
    </p>
    <div className="flex shrink-0 items-center">
      <button
        aria-keyshortcuts="ArrowLeft"
        aria-label="The photo before"
        className={iconButton}
        disabled={!hasBefore}
        onClick={() => onTurn(-1)}
        title="The photo before (←)"
        type="button"
      >
        <ChevronLeft aria-hidden="true" size={iconSize} />
      </button>
      <button
        aria-keyshortcuts="ArrowRight"
        aria-label="The next photo"
        className={iconButton}
        disabled={!hasAfter}
        onClick={() => onTurn(1)}
        title="The next photo (→)"
        type="button"
      >
        <ChevronRight aria-hidden="true" size={iconSize} />
      </button>
    </div>
    <button
      aria-expanded={isInfoShown}
      aria-keyshortcuts="I"
      aria-label="About this photo"
      className={`${iconButton} aria-expanded:text-lamp`}
      onClick={onInfo}
      title="About this photo (I)"
      type="button"
    >
      <PanelRight aria-hidden="true" size={iconSize} />
    </button>
  </header>
);
