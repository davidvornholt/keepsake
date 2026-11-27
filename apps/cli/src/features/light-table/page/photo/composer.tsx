import { Check } from 'lucide-react';
import { type KeyboardEvent, useEffect, useEffectEvent, useRef } from 'react';
import type { Box } from '../../contract.ts';
import { count } from '../data/format.ts';
import { mainButton, quietButton } from '../ui/classes.ts';
import { Key } from '../ui/controls.tsx';

// Where the owner writes what should change, and sees the boxes they drew
// on the photo to show where; or, for a photo that is to come in, what they
// want of its edit.

export type Draft = {
  readonly note: string;
  readonly boxes: ReadonlyArray<{ readonly box: Box; readonly since: number }>;
};

const iconSize = 20;

const boxesSay = ({ note, boxes }: Draft): string => {
  if (boxes.length === 0) {
    return 'Drag on the photo to show where.';
  }
  const said = `${count(boxes.length, 'box', 'boxes')}. Drag one to move it, its corners to change its size.`;
  return note.trim() === '' ? `${said} Say what should change there.` : said;
};

type Props = {
  readonly draft: Draft;
  /** Whether a change was written down before, which can be taken back. */
  readonly isSaved: boolean;
  /** Whether boxes can show where, which only a photo with an edit has. */
  readonly canDraw: boolean;
  /** Whether something was done to the boxes that can be undone. */
  readonly canUndo: boolean;
  readonly onUndo: () => void;
  readonly onDraft: (draft: Draft) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
  readonly onRemove: () => void;
};

export const Composer = ({
  draft,
  isSaved,
  canDraw,
  canUndo,
  onUndo,
  onDraft,
  onSave,
  onCancel,
  onRemove,
}: Props) => {
  const noteRef = useRef<HTMLTextAreaElement>(null);
  // Boxes show only where; an agent needs the words to know what.
  const hasNoNote = draft.note.trim() === '';
  const words = canDraw
    ? { asked: 'What should change?', saves: 'Mark the change' }
    : { asked: 'What do you want of the edit?', saves: 'Mark the wish' };

  const save = useEffectEvent(() => {
    if (!hasNoNote) {
      onSave();
    }
  });

  useEffect(() => {
    noteRef.current?.focus({ preventScroll: true });
    // Drawing a box takes the keyboard away from the words. The next letter
    // brings it back and lands in them, and Enter saves them all the same.
    const onKey = (event: globalThis.KeyboardEvent) => {
      const isLetter =
        event.key.length === 1 &&
        !(event.ctrlKey || event.metaKey || event.altKey);
      const { activeElement } = document;
      const isElsewhere =
        activeElement === null ||
        activeElement === document.body ||
        activeElement.closest('button, a[href], input, textarea') === null;
      // On a box, too, the next letter belongs to the words.
      const isOnBox = activeElement?.closest('[data-boxes]') !== null;
      if (isLetter && (isElsewhere || isOnBox)) {
        noteRef.current?.focus({ preventScroll: true });
      }
      if (event.key === 'Enter' && isElsewhere) {
        event.preventDefault();
        save();
      }
    };
    globalThis.addEventListener('keydown', onKey, true);
    return () => globalThis.removeEventListener('keydown', onKey, true);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      save();
    }
  };

  return (
    <form
      aria-label={words.asked.slice(0, -1)}
      className="mx-auto flex w-full max-w-[44rem] flex-col gap-1 px-3"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="flex items-end gap-2">
        <textarea
          aria-label={words.asked}
          className="field-sizing-content max-h-32 min-h-11 min-w-0 flex-1 resize-none border border-wax-yellow bg-sheet px-3 py-2.5 text-[0.9375rem] text-lamp leading-snug outline-none placeholder:text-quiet"
          enterKeyHint="done"
          onChange={(event) => onDraft({ ...draft, note: event.target.value })}
          onKeyDown={onKeyDown}
          placeholder={words.asked}
          ref={noteRef}
          rows={1}
          value={draft.note}
        />
        <button
          aria-label={words.saves}
          className={`${mainButton} h-11 shrink-0 max-sm:w-11 max-sm:justify-center max-sm:px-0`}
          disabled={hasNoNote}
          type="submit"
        >
          <Check aria-hidden="true" className="sm:hidden" size={iconSize} />
          <span className="max-sm:hidden">{words.saves}</span>
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4">
        <p className="mr-auto flex min-h-9 flex-wrap items-center gap-x-3 text-quiet text-sm">
          {canDraw ? boxesSay(draft) : 'It is done with the photo’s edit.'}
        </p>
        {canUndo ? (
          <button
            aria-keyshortcuts="Control+Z"
            className={`${quietButton} min-h-9 text-sm`}
            onClick={onUndo}
            title="Undo what was last done to the boxes (Ctrl Z)"
            type="button"
          >
            Undo
          </button>
        ) : null}
        {isSaved ? (
          <button
            className={`${quietButton} min-h-9 text-sm`}
            onClick={onRemove}
            type="button"
          >
            Take back
          </button>
        ) : null}
        <button
          className={`${quietButton} min-h-9 text-sm`}
          onClick={onCancel}
          type="button"
        >
          Cancel <Key>Esc</Key>
        </button>
      </div>
    </form>
  );
};
