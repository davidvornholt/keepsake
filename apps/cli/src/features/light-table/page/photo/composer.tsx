import { Check } from 'lucide-react';
import { type KeyboardEvent, useEffect, useEffectEvent, useRef } from 'react';
import type { Box } from '../../contract.ts';
import { count } from '../data/format.ts';
import { mainButton, quietButton } from '../ui/classes.ts';
import { Key } from '../ui/controls.tsx';

// Where the owner writes what should change, and sees the boxes they drew
// on the photo to show where.

export type Draft = {
  readonly note: string;
  readonly boxes: ReadonlyArray<{ readonly box: Box; readonly since: number }>;
};

const iconSize = 20;

type Props = {
  readonly draft: Draft;
  /** Whether a change was written down before, which can be taken back. */
  readonly isSaved: boolean;
  readonly onDraft: (draft: Draft) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
  readonly onRemove: () => void;
};

export const Composer = ({
  draft,
  isSaved,
  onDraft,
  onSave,
  onCancel,
  onRemove,
}: Props) => {
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const isEmpty = draft.note.trim() === '' && draft.boxes.length === 0;

  const save = useEffectEvent(() => {
    if (!isEmpty) {
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
      if (isLetter && isElsewhere) {
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
      if (!isEmpty) {
        onSave();
      }
    }
  };

  return (
    <form
      aria-label="What should change"
      className="mx-auto flex w-full max-w-[44rem] flex-col gap-1 px-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="flex items-end gap-2">
        <textarea
          aria-label="What should change?"
          className="field-sizing-content max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-[3px] border border-wax-yellow bg-sheet px-3 py-2.5 text-[0.9375rem] text-lamp leading-snug outline-none placeholder:text-quiet"
          enterKeyHint="done"
          onChange={(event) => onDraft({ ...draft, note: event.target.value })}
          onKeyDown={onKeyDown}
          placeholder="What should change?"
          ref={noteRef}
          rows={1}
          value={draft.note}
        />
        <button
          aria-label="Mark the change"
          className={`${mainButton} h-11 shrink-0 max-sm:w-11 max-sm:justify-center max-sm:px-0`}
          disabled={isEmpty}
          type="submit"
        >
          <Check aria-hidden="true" className="sm:hidden" size={iconSize} />
          <span className="max-sm:hidden">Mark the change</span>
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4">
        <p className="mr-auto flex min-h-9 flex-wrap items-center gap-x-3 text-quiet text-sm">
          {draft.boxes.length === 0
            ? 'Drag on the photo to show where.'
            : `${count(draft.boxes.length, 'box', 'boxes')} on the photo.`}
          {draft.boxes.length === 0 ? null : (
            <button
              className={`${quietButton} min-h-9 text-sm`}
              onClick={() =>
                onDraft({ ...draft, boxes: draft.boxes.slice(0, -1) })
              }
              type="button"
            >
              Remove the last
            </button>
          )}
        </p>
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
