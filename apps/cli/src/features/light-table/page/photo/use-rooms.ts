import type { PhotoView } from '../../contract.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { frontOf, pileAround } from '../data/derive.ts';
import {
  roomOf,
  roomsOf,
  stackHeight,
  standingHeight,
  wordHeight,
} from './room.ts';
import type { Around } from './use-photo.ts';
import type { SaidHeights } from './use-said-heights.ts';
import { type Word, wordOf } from './word.ts';

// Where a photo has room in the window, given what stands around it: what
// is said about it above the pencils, the photo it is measured against,
// and what is known about it at the side.

export const useRooms = (
  photo: PhotoView,
  { size, isInfoShown }: Pick<Around, 'size' | 'isInfoShown'>,
  about: {
    /** Whether a change is being written, which takes the place of the pencils. */
    readonly isComposing: boolean;
    /** How tall what stands below the photo was measured to be. */
    readonly measured: number;
    /** How tall what is said about each photo is, as far as that is known. */
    readonly saidHeights: SaidHeights;
  },
) => {
  const { index, state } = useShootContext();
  const { isComposing, measured, saidHeights } = about;
  /** What an agent or the owner says about a photo that is looked at. */
  const wordFor = (asked: PhotoView, isWriting: boolean): Word | null =>
    wordOf(index, asked, {
      isWorkedOn: state.activity?.photos.includes(asked.id) ?? false,
      isComposing: isWriting,
    });
  /** The room what stands above the pencils of a photo takes. */
  const aboveOf = (asked: PhotoView): number =>
    (saidHeights.get(asked.id) ??
      standingHeight + (wordFor(asked, false) === null ? 0 : wordHeight)) +
    (pileAround(index, asked).photos.length > 1 ? stackHeight : 0);
  const word = wordFor(photo, isComposing);
  const other = frontOf(index, photo);
  const rooms = roomsOf(
    size,
    {
      isInfoShown,
      isComposing,
      extra: isComposing ? Number(word !== null) * wordHeight : aboveOf(photo),
      // The words of a change grow while they are written.
      measured: isComposing ? measured : 0,
    },
    other !== null,
  );
  /** Where a photo beside this one rests, which has other things below it. */
  const roomBeside = (beside: PhotoView) =>
    roomOf(size, {
      isInfoShown,
      isComposing: false,
      extra: aboveOf(beside),
      measured: 0,
    });
  return { word, wordFor, other, rooms, roomBeside };
};
