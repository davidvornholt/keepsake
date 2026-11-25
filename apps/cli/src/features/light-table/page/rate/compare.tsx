import { type RefObject, useEffect } from 'react';
import type { PhotoView } from '../../contract.ts';
import type { Rating } from '../data/api.ts';
import { WaxMark } from '../marks/wax-mark.tsx';
import { usePicture } from '../photo/use-picture.ts';
import type { Rect } from '../sheet/layout.ts';
import { Img, Placed } from '../ui/placed.tsx';
import type { Tiles } from './grid.ts';
import { starsUpTo } from './rating.ts';

// The photos of a moment next to each other, each as large as it can be.
// Choosing one shows it large; any of the others can be kept too.

type TileProps = {
  readonly photo: PhotoView;
  readonly rect: Rect;
  readonly name: string;
  /** The stars it got before, when it was chosen as the best. */
  readonly stars: number | null;
  readonly tileRef: (element: HTMLButtonElement | null) => void;
  readonly onChoose: () => void;
  readonly onFocus: () => void;
};

const Tile = ({
  photo,
  rect,
  name,
  stars,
  tileRef,
  onChoose,
  onFocus,
}: TileProps) => {
  const src = usePicture(photo.picture, rect.w * globalThis.devicePixelRatio);
  return (
    <Placed rect={rect}>
      <button
        aria-label={stars === null ? name : `${name}, chosen before`}
        className="group/tile relative block size-full cursor-zoom-in overflow-hidden"
        onClick={onChoose}
        onFocus={onFocus}
        ref={tileRef}
        type="button"
      >
        {src === null ? null : <Img className="size-full" src={src} />}
        <span className="pointer-events-none absolute inset-0 border border-transparent transition-colors duration-150 group-hover/tile:border-lamp" />
        {stars === null ? null : (
          <span className="pointer-events-none absolute bottom-[4%] left-[3%] flex">
            {starsUpTo(stars).map((at) => (
              <WaxMark
                className="size-7"
                color="wax-white"
                key={at}
                seed={`${photo.id}-star-${at}`}
                shape="star"
              />
            ))}
          </span>
        )}
      </button>
    </Placed>
  );
};

const KeepToo = ({
  rect,
  photo,
  name,
  isKept,
  onToggle,
}: {
  readonly rect: Rect;
  readonly photo: string;
  readonly name: string;
  readonly isKept: boolean;
  readonly onToggle: () => void;
}) => (
  <Placed className="flex items-start" rect={rect}>
    <button
      aria-label={`Keep too: ${name}`}
      aria-pressed={isKept}
      className="type-label flex h-9 items-center gap-2 pr-2.5 pl-1 text-[0.8125rem] text-quiet transition-colors duration-150 hover:text-lamp aria-pressed:text-lamp"
      onClick={onToggle}
      type="button"
    >
      <WaxMark
        className="size-5"
        color={isKept ? 'wax-white' : 'rule'}
        seed={`${photo}:keep-too`}
        shape="tick"
      />
      Keep too
    </button>
  </Placed>
);

type Props = {
  readonly photos: ReadonlyArray<PhotoView>;
  readonly tiles: Tiles;
  readonly rating: Rating | undefined;
  readonly kept: ReadonlySet<string>;
  /** The photo the keyboard is on, if it is on one. */
  readonly focused: number | null;
  /** False while one of the photos is shown large over them. */
  readonly isOn: boolean;
  readonly tilesRef: RefObject<Map<number, HTMLButtonElement>>;
  readonly onFocus: (index: number) => void;
  readonly onChoose: (index: number) => void;
  readonly onKeep: (photo: string) => void;
};

export const Compare = ({
  photos,
  tiles,
  rating,
  kept,
  focused,
  isOn,
  tilesRef,
  onFocus,
  onChoose,
  onKeep,
}: Props) => {
  useEffect(() => {
    if (focused !== null && isOn) {
      tilesRef.current.get(focused)?.focus({ preventScroll: true });
    }
  }, [focused, tilesRef, isOn]);

  return (
    <ol aria-label="The photos of this moment" className="contents">
      {photos.map((photo, at) => {
        const rect = tiles.photos[at];
        const below = tiles.below[at];
        const name = `Photo ${at + 1} of ${photos.length}`;
        return rect === undefined || below === undefined ? null : (
          <li className="contents" key={photo.id}>
            <Tile
              name={name}
              onChoose={() => onChoose(at)}
              onFocus={() => onFocus(at)}
              photo={photo}
              rect={rect}
              stars={rating?.best === photo.id ? rating.stars : null}
              tileRef={(element) => {
                if (element === null) {
                  tilesRef.current.delete(at);
                } else {
                  tilesRef.current.set(at, element);
                }
              }}
            />
            <KeepToo
              isKept={kept.has(photo.id)}
              name={name}
              onToggle={() => onKeep(photo.id)}
              photo={photo.id}
              rect={below}
            />
          </li>
        );
      })}
    </ol>
  );
};
