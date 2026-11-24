import type { Box } from '../../../shared/domain.ts';
import type { Raster } from '../../../shared/pictures.ts';
import {
  distanceFrom,
  fading,
  frameAround,
  type Room,
  roomOf,
  withRoom,
} from '../pixels/frames.ts';
import { channels, indexOf } from '../pixels/raster.ts';

/** A model's box is never exact. */
const spare: Room = { pixels: 6, height: 0.04 };

/** Changes an edit, except in some boxes, where it stays as it is. */
export const changeOutside = (
  boxes: ReadonlyArray<Box>,
  edit: Raster,
  change: () => void,
): void => {
  const before = boxes.length === 0 ? edit.pixels : edit.pixels.slice();
  change();
  for (const box of boxes) {
    const exact = frameAround(box, edit);
    const room = roomOf(spare, exact);
    const frame = withRoom(exact, room, edit);
    for (let y = frame.top; y < frame.top + frame.height; y += 1) {
      for (let x = frame.left; x < frame.left + frame.width; x += 1) {
        const part = fading(distanceFrom(exact, x, y), 0, room);
        const index = indexOf(edit, x, y);
        for (const channel of channels) {
          edit.pixels[index + channel] = Math.round(
            part * (before[index + channel] ?? 0) +
              (1 - part) * (edit.pixels[index + channel] ?? 0),
          );
        }
      }
    }
  }
};
