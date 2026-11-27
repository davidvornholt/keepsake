import { ZoomOut } from 'lucide-react';
import type { RefObject } from 'react';
import type { PhotoView } from '../../contract.ts';
import type { Pile } from '../data/derive.ts';
import { chrome, iconButton } from '../ui/classes.ts';
import { Words } from './answer.tsx';
import { Composer } from './composer.tsx';
import { MarkBar } from './mark-bar.tsx';
import { StackStrip } from './stack-strip.tsx';
import { StandingLine } from './standing-line.tsx';
import type { Composing, Marking, Showing } from './use-photo.ts';
import type { Word } from './word.ts';

// What lies below a photo that is looked at, and what is left of it all
// when the photo is looked at from close.

const iconSize = 20;

/**
 * Where the photo stands and why, the pile it lies in, what keepsake says,
 * and the owner's pencils or the words of a change.
 */
export const Below = ({
  photo,
  pile,
  onShow,
  word,
  doing,
  footRef,
  isAside,
  isOnPhoto,
}: {
  readonly photo: PhotoView;
  /** The photos that show the same, this one too. */
  readonly pile: Pile;
  readonly onShow: (photo: string) => void;
  readonly word: Word | null;
  readonly doing: {
    readonly shown: Showing;
    readonly composing: Composing;
    readonly marking: Marking;
  };
  readonly footRef: RefObject<HTMLElement | null>;
  /** Whether it has made way for a photo that is looked at from close. */
  readonly isAside: boolean;
  /** Whether it lies on the photo, and needs a ground to be read on. */
  readonly isOnPhoto: boolean;
}) => {
  const { shown, composing, marking } = doing;
  const isComposing = composing.draft !== null;
  return (
    <footer
      className={`${chrome} absolute bottom-0 left-0 z-10 flex flex-col justify-end pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] ${isAside ? 'pointer-events-none translate-y-full opacity-0' : ''} ${isOnPhoto ? 'bg-ground' : ''}`}
      inert={isAside}
      ref={footRef}
    >
      {isComposing ? null : (
        <div data-standing={photo.standing.kind}>
          <StandingLine photo={photo} />
        </div>
      )}
      {isComposing || pile.photos.length < 2 ? null : (
        <StackStrip onShow={onShow} pile={pile} shown={photo.id} />
      )}
      <div aria-live="polite">
        {word === null ? null : (
          <Words
            hasBefore={(photo.edit?.earlier.length ?? 0) > 0}
            onBefore={shown.stepBack}
            onEdit={() => marking.onPencil('change')}
            onSeen={marking.seen}
            word={word}
          />
        )}
      </div>
      {composing.draft === null ? (
        <MarkBar onPencil={marking.onPencil} photo={photo} />
      ) : (
        <Composer
          canDraw={composing.canDraw}
          canUndo={composing.canUndo}
          draft={composing.draft}
          isSaved={composing.isSaved}
          onAddBox={composing.placeBox}
          onCancel={composing.cancel}
          onDraft={composing.setDraft}
          onRemove={composing.remove}
          onSave={composing.save}
          onUndo={composing.undoBox}
        />
      )}
    </footer>
  );
};

/** The way back from close to the whole photo, and how close it is. */
export const Whole = ({
  isShown,
  shareRef,
  onWhole,
}: {
  readonly isShown: boolean;
  /** Where the size is printed: at 100 % a pixel of the picture is one of the screen. */
  readonly shareRef: RefObject<HTMLSpanElement | null>;
  readonly onWhole: () => void;
}) => (
  <div
    className={`absolute top-1.5 left-1.5 z-10 flex items-center bg-ground pr-3 transition-opacity duration-200 motion-reduce:transition-none sm:left-3 ${isShown ? '' : 'pointer-events-none opacity-0'}`}
    inert={!isShown}
  >
    <button
      aria-keyshortcuts="Escape"
      aria-label="Show the whole photo"
      className={`${iconButton} text-lamp`}
      onClick={onWhole}
      title="Show the whole photo (Esc)"
      type="button"
    >
      <ZoomOut aria-hidden="true" size={iconSize} />
    </button>
    <span
      aria-hidden="true"
      className="type-edge tabular min-w-9 text-right text-print"
      ref={shareRef}
    />
  </div>
);
