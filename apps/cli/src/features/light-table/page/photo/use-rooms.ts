import type { PhotoView } from '../../contract.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { frontOf, type Index, pileAround } from '../data/derive.ts';
import {
  roomOf,
  roomsOf,
  stackHeight,
  standingHeight,
  wordHeight,
} from './room.ts';
import type { Around } from './use-photo.ts';
import { wordOf } from './word.ts';

// Where a photo has room in the window, given what stands around it: what
// is said about it above the pencils, the photo it is measured against,
// and what is known about it at the side.

/** The room what stands above the pencils of a photo takes. */
const aboveOf = (index: Index, photo: PhotoView, hasWord: boolean): number =>
  (hasWord ? wordHeight : 0) +
  standingHeight +
  (pileAround(index, photo).photos.length > 1 ? stackHeight : 0);

export const useRooms = (
  photo: PhotoView,
  { size, isInfoShown }: Pick<Around, 'size' | 'isInfoShown'>,
  about: {
    /** Whether a change is being written, which takes the place of the pencils. */
    readonly isComposing: boolean;
    /** How tall what stands below the photo was measured to be. */
    readonly measured: number;
  },
) => {
  const { index, state } = useShootContext();
  const { isComposing, measured } = about;
  const isWorkedOn = state.activity?.photos.includes(photo.id) ?? false;
  const word = wordOf(index, photo, { isWorkedOn, isComposing });
  const other = frontOf(index, photo);
  const hasWord = word !== null;
  const rooms = roomsOf(
    size,
    {
      isInfoShown,
      isComposing,
      extra: isComposing
        ? Number(hasWord) * wordHeight
        : aboveOf(index, photo, hasWord),
      measured,
    },
    other !== null,
  );
  /** Where a photo beside this one rests, which has other things below it. */
  const roomBeside = (beside: PhotoView) =>
    roomOf(size, {
      isInfoShown,
      isComposing: false,
      extra: aboveOf(
        index,
        beside,
        wordOf(index, beside, { isWorkedOn: false, isComposing: false }) !==
          null,
      ),
      measured: 0,
    });
  return { word, other, rooms, roomBeside };
};
