import { type RefObject, useImperativeHandle, useRef } from 'react';
import type { PhotoView, Picture } from '../../contract.ts';
import { blurOf } from '../data/pictures.ts';
import type { Rect } from '../sheet/layout.ts';
import { Img, Placed } from '../ui/placed.tsx';
import { fitIn } from './room.ts';
import { usePicture } from './use-picture.ts';

// The photos before and after the one that is looked at, just out of sight
// on either side. A finger that pulls the photo aside pulls them in.

export type NeighboursHandle = {
  /** Moves them with the photo, which is so far off to the side. */
  readonly follow: (offset: number) => void;
};

const bestOf = ({ edit, picture }: PhotoView): Picture =>
  edit?.picture ?? picture;

const Neighbour = ({
  photo,
  room,
  away,
}: {
  readonly photo: PhotoView;
  readonly room: Rect;
  /** How far to the side it lies while the photo rests. */
  readonly away: number;
}) => {
  const picture = bestOf(photo);
  const place = fitIn(room, picture.width / picture.height);
  const src = usePicture(picture, place.w * globalThis.devicePixelRatio);
  return (
    <Placed blur={blurOf(picture)} rect={{ ...place, x: place.x + away }}>
      {src === null ? null : (
        <Img className="size-full" isUrgent={true} src={src} />
      )}
    </Placed>
  );
};

export const Neighbours = ({
  before,
  after,
  roomOf,
  distance,
  handleRef,
}: {
  readonly before: PhotoView | undefined;
  readonly after: PhotoView | undefined;
  /** Where a photo rests when it is the one looked at. */
  readonly roomOf: (photo: PhotoView) => Rect;
  /** How far apart two photos lie. */
  readonly distance: number;
  readonly handleRef: RefObject<NeighboursHandle | null>;
}) => {
  const elementRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(handleRef, () => ({
    follow: (offset) => {
      const element = elementRef.current;
      if (element !== null) {
        element.style.visibility = offset === 0 ? 'hidden' : 'visible';
        element.style.transform = `translate3d(${offset}px, 0, 0)`;
      }
    },
  }));
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none invisible absolute inset-0 will-change-transform"
      ref={elementRef}
    >
      {before === undefined ? null : (
        <Neighbour away={-distance} photo={before} room={roomOf(before)} />
      )}
      {after === undefined ? null : (
        <Neighbour away={distance} photo={after} room={roomOf(after)} />
      )}
    </div>
  );
};
