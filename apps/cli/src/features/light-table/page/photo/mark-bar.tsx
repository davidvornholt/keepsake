import { Heart, Undo2 } from 'lucide-react';
import type { PhotoView } from '../../contract.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { isFavorite } from '../data/derive.ts';
import { effectFor, isMadeOn, nameFor, pencilsFor } from '../marks/act.ts';
import { lookOf, type Pencil, seedTextOf } from '../marks/kinds.ts';
import { WaxMark } from '../marks/wax-mark.tsx';
import { Key } from '../ui/controls.tsx';
import { useSince } from '../ui/use-since.ts';

// The owner's pencils, below the photo. Taking a photo out or putting it in
// happens at once; while it waits for other work, its pencil is drawn in wax
// and pressing it again takes it back. A change is drawn once it is written.
// Undo is there for as long as it can be. Beside them, for a photo of the
// album, the favorite heart of Immich.

const iconSize = 16;
const heartSize = 20;
const button =
  'group/mark type-label flex min-h-12 min-w-16 flex-col items-center justify-center gap-1 px-3 text-[0.8125rem] text-quiet transition-colors duration-150 hover:bg-raised hover:text-lamp aria-pressed:text-lamp sm:flex-row sm:gap-2.5 sm:text-sm';

const MarkButton = ({
  photo,
  pencil,
  isMade,
  onPencil,
}: {
  readonly photo: PhotoView;
  readonly pencil: Pencil;
  readonly isMade: boolean;
  readonly onPencil: (pencil: Pencil) => void;
}) => {
  const { index } = useShootContext();
  const look = lookOf[pencil];
  const since = useSince(isMade ? pencil : null);
  return (
    <button
      aria-keyshortcuts={look.key}
      aria-pressed={isMade}
      className={button}
      onClick={() => onPencil(pencil)}
      title={effectFor(index, photo, pencil)}
      type="button"
    >
      <WaxMark
        className="size-6"
        color={isMade ? look.wax : 'quiet'}
        seed={seedTextOf(photo.id, pencil)}
        shape={look.shape}
        since={isMade ? since : null}
      />
      <span className="whitespace-nowrap">{nameFor(index, photo, pencil)}</span>
      <Key>{look.key}</Key>
    </button>
  );
};

/** Immich's own favorite heart, set at once and not handed to anyone. */
const FavoriteButton = ({ photo }: { readonly photo: PhotoView }) => {
  const { store } = useShootContext();
  const isSet = isFavorite(photo);
  return (
    <button
      aria-keyshortcuts="F"
      aria-pressed={isSet}
      className={button}
      onClick={() => {
        store.favorite(photo.id, !isSet).catch(() => undefined);
      }}
      title={
        isSet
          ? 'A favorite in Immich. Press to take the heart away (F)'
          : 'Make it a favorite in Immich, at once (F)'
      }
      type="button"
    >
      <Heart
        aria-hidden="true"
        className={isSet ? 'heart-set fill-wax-white text-wax-white' : ''}
        size={heartSize}
      />
      <span className="whitespace-nowrap">Favorite</span>
      <Key>F</Key>
    </button>
  );
};

export const MarkBar = ({
  photo,
  onPencil,
}: {
  readonly photo: PhotoView;
  readonly onPencil: (pencil: Pencil) => void;
}) => {
  const { index, state, store } = useShootContext();
  const { undoable } = state;
  const pencils = pencilsFor(index, photo);
  return (
    <div className="flex min-h-12 justify-center">
      <div className="relative">
        {pencils.length === 0 ? (
          <p className="flex min-h-12 items-center px-4 text-center text-quiet">
            Once the best photos are chosen, you mark here what you want
            different.
          </p>
        ) : (
          <ul
            aria-label="Mark this photo"
            className="flex items-center gap-1 sm:gap-2"
          >
            {pencils.map((pencil) => (
              <li key={pencil}>
                <MarkButton
                  isMade={isMadeOn(index, photo, pencil)}
                  onPencil={onPencil}
                  pencil={pencil}
                  photo={photo}
                />
              </li>
            ))}
            {photo.standing.kind === 'album' ? (
              <li className="border-raised border-l pl-1 sm:pl-2">
                <FavoriteButton photo={photo} />
              </li>
            ) : null}
          </ul>
        )}
        {/* Beside the pencils, so that they stay in the middle without it. */}
        <button
          aria-keyshortcuts="U"
          className="type-label absolute top-0 left-full ml-1 flex min-h-12 min-w-11 items-center justify-center gap-2 px-3 text-print text-sm transition-[opacity,color] duration-150 hover:bg-raised hover:text-lamp disabled:invisible disabled:opacity-0 sm:ml-4"
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
