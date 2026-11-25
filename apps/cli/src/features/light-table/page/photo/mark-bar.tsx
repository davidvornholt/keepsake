import { Undo2 } from 'lucide-react';
import type { MarkKind, PhotoView } from '../../contract.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { isFavorite, markedIn } from '../data/derive.ts';
import { kindsFor } from '../marks/act.ts';
import { lookOf, seedTextOf } from '../marks/kinds.ts';
import { WaxMark } from '../marks/wax-mark.tsx';
import { Key } from '../ui/controls.tsx';
import { useSince } from '../ui/use-since.ts';

// The owner's pencils, below the photo. A mark that is made is drawn in wax;
// pressing it again takes it back, and Undo is there for as long as it can be.

const iconSize = 16;

const MarkButton = ({
  photo,
  kind,
  isMade,
  onKind,
}: {
  readonly photo: PhotoView;
  readonly kind: MarkKind;
  readonly isMade: boolean;
  readonly onKind: (kind: MarkKind) => void;
}) => {
  const look = lookOf[kind];
  const since = useSince(isMade ? kind : null);
  return (
    <button
      aria-keyshortcuts={look.key}
      aria-pressed={isMade}
      className="group/mark type-label flex min-h-12 min-w-16 flex-col items-center justify-center gap-1 rounded-[3px] px-3 text-[0.8125rem] text-quiet transition-colors duration-150 hover:bg-raised hover:text-lamp aria-pressed:text-lamp sm:flex-row sm:gap-2.5 sm:text-sm"
      onClick={() => onKind(kind)}
      type="button"
    >
      <WaxMark
        className="size-6"
        color={isMade ? look.wax : 'quiet'}
        seed={seedTextOf(photo.id, kind)}
        shape={look.shape}
        since={isMade ? since : null}
      />
      <span className="whitespace-nowrap">{look.says}</span>
      <Key>{look.key}</Key>
    </button>
  );
};

export const MarkBar = ({
  photo,
  onKind,
}: {
  readonly photo: PhotoView;
  readonly onKind: (kind: MarkKind) => void;
}) => {
  const { index, state, store } = useShootContext();
  const { open } = markedIn(index, photo.id);
  const { undoable } = state;
  return (
    <div className="flex justify-center">
      <div className="relative">
        <ul
          aria-label="Mark this photo"
          className="flex items-center gap-1 sm:gap-2"
        >
          {kindsFor(index, photo).map((kind) => (
            <li key={kind}>
              <MarkButton
                isMade={
                  kind === 'favorite'
                    ? isFavorite(index, photo)
                    : open?.kind === kind
                }
                kind={kind}
                onKind={onKind}
                photo={photo}
              />
            </li>
          ))}
        </ul>
        {/* Beside the pencils, so that they stay in the middle without it. */}
        <button
          aria-keyshortcuts="U"
          className="type-label absolute top-0 left-full ml-1 flex min-h-12 min-w-11 items-center justify-center gap-2 rounded-[3px] px-3 text-print text-sm transition-[opacity,color] duration-150 hover:bg-raised hover:text-lamp disabled:invisible disabled:opacity-0 sm:ml-4"
          disabled={undoable === null}
          onClick={() => store.undo()}
          type="button"
        >
          <Undo2 aria-hidden="true" size={iconSize} />
          <span className="max-sm:sr-only">Undo</span>
          <Key>U</Key>
        </button>
      </div>
    </div>
  );
};
