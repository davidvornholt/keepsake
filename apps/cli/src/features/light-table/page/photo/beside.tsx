import { type RefObject, useImperativeHandle, useRef } from 'react';
import type { PhotoView } from '../../contract.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { blurOf } from '../data/pictures.ts';
import { standingName } from '../data/words.ts';
import type { Rect } from '../sheet/layout.ts';
import { chrome } from '../ui/classes.ts';
import { Img, Placed } from '../ui/placed.tsx';
import {
  captionHeight,
  fitIn,
  mirrored,
  type Rooms,
  type Seen,
} from './room.ts';
import type { Still } from './stage.tsx';
import { useClip } from './use-clip.ts';
import { usePicture } from './use-picture.ts';

// The photo that stands in front of the one looked at, beside it, so the two
// can be compared at a glance, and spot by spot from close.

const isPlain = (event: {
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly button: number;
}): boolean =>
  !(event.metaKey || event.ctrlKey || event.shiftKey) && event.button === 0;

/** How far print that lies on a photo keeps from its edge. */
const fromEdge = 10;

/**
 * What a picture is, in small print: right below it, or on a ground of its
 * own in a corner of it while it fills all it has.
 */
const Caption = ({
  under,
  over,
  isOver,
  children,
}: {
  /** Where the picture lies when all of it is shown. */
  readonly under: Rect;
  /** What it fills when it is looked at from close. */
  readonly over: Rect;
  readonly isOver: boolean;
  readonly children: string;
}) => (
  <>
    <Placed
      className={`${chrome} type-edge pointer-events-none z-[1] grid place-items-center text-quiet ${isOver ? 'opacity-0' : ''}`}
      rect={{
        x: under.x,
        y: under.y + under.h,
        w: under.w,
        h: captionHeight,
      }}
    >
      {children}
    </Placed>
    <Placed
      className={`type-edge pointer-events-none z-[2] grid place-items-center text-print transition-opacity duration-200 motion-reduce:transition-none ${isOver ? '' : 'opacity-0'}`}
      rect={{
        x: over.x,
        y: over.y + over.h - captionHeight - fromEdge,
        w: over.w,
        h: captionHeight,
      }}
    >
      <span aria-hidden="true" className="bg-ground px-2 py-1.5">
        {children}
      </span>
    </Placed>
  </>
);

export type BesideHandle = {
  /** Shows the same spot as the photo it stands beside, as large. */
  readonly follow: (seen: Seen) => void;
  /** Goes along when that photo is pulled to the side. */
  readonly shift: (offset: number) => void;
  /** The picture as it is on the screen, for when another photo takes over. */
  readonly still: () => Still | null;
};

type Props = {
  readonly photo: PhotoView;
  readonly other: PhotoView;
  readonly rooms: Rooms & { readonly theirs: Rect; readonly wideTheirs: Rect };
  /** Whether the two are looked at from close. */
  readonly isClose: boolean;
  /** What is cut away around the other one then, as the sides of an inset. */
  readonly clip: string;
  readonly handleRef: RefObject<BesideHandle | null>;
};

/** A photo from behind another, and the one in front that it is measured against. */
export const Pair = ({
  photo,
  other,
  rooms,
  isClose,
  clip,
  handleRef,
}: Props) => {
  const { hrefOfPhoto, openPhoto, index } = useShootContext();
  const allRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const placedRef = useRef<HTMLDivElement>(null);
  const mine = photo.edit?.picture ?? photo.picture;
  const picture = other.edit?.picture ?? other.picture;
  const place = fitIn(rooms.theirs, picture.width / picture.height);
  const src = usePicture(
    picture,
    isClose ? picture.width : place.w * globalThis.devicePixelRatio,
  );
  const says = standingName(other);
  const number = index.numberOf.get(other.id) ?? 0;
  useClip(windowRef, isClose ? clip : null);

  useImperativeHandle(handleRef, () => ({
    follow: (seen) => {
      const placed = placedRef.current;
      if (placed !== null) {
        const to = mirrored(seen, place);
        placed.style.transform = `translate3d(${to.x - place.x}px, ${to.y - place.y}px, 0) scale(${to.w / place.w})`;
      }
    },
    shift: (offset) => {
      if (allRef.current !== null) {
        allRef.current.style.transform =
          offset === 0 ? '' : `translate3d(${offset}px, 0, 0)`;
      }
    },
    still: () => (src === null ? null : { src, rect: place }),
  }));

  return (
    <div className="pointer-events-none absolute inset-0" ref={allRef}>
      <Caption
        isOver={isClose}
        over={rooms.wide}
        under={fitIn(rooms.mine, mine.width / mine.height)}
      >
        This one
      </Caption>
      <div
        className={`${chrome} pointer-events-none absolute inset-0 z-[1]`}
        ref={windowRef}
      >
        <Placed
          blur={blurOf(picture)}
          className={`origin-top-left will-change-transform ${isClose ? '' : 'pointer-events-auto'}`}
          placedRef={placedRef}
          rect={place}
        >
          <a
            aria-label={`${says}: photo ${number}`}
            className="block size-full"
            href={hrefOfPhoto(other.id)}
            onClick={(event) => {
              if (isPlain(event)) {
                event.preventDefault();
                openPhoto(other.id, 'push');
              }
            }}
          >
            {src === null ? null : <Img className="size-full" src={src} />}
          </a>
        </Placed>
      </div>
      <Caption isOver={isClose} over={rooms.wideTheirs} under={place}>
        {says}
      </Caption>
    </div>
  );
};
