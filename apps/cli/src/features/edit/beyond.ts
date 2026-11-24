import {
  clamp,
  coverage,
  ordered,
  tidyBox,
  wholePicture,
} from '../../shared/boxes.ts';
import type { Box } from '../../shared/domain.ts';
import { within } from './geometry.ts';

/** How far a frame may reach beyond each edge of the photo. */
const mostBeyond = 0.25;
/** A smaller step beyond an edge isn't worth inventing anything for. */
const leastBeyond = 0.04;
/** How much of a frame has to be the photo. */
const leastPhoto = 0.7;

const inReach = (position: number): number => {
  const step = Math.max(-position, position - 1);
  return step < leastBeyond
    ? clamp(position, 0, 1)
    : clamp(position, -mostBeyond, 1 + mostBeyond);
};

/** A box with its sides in order, beyond the photo only as far as it may be. */
export const frameBox = (box: Box): Box =>
  ordered({
    left: inReach(box.left),
    top: inReach(box.top),
    right: inReach(box.right),
    bottom: inReach(box.bottom),
  });

/** Whether enough of a frame is the photo. */
export const isMostlyPhoto = (box: Box): boolean =>
  coverage(tidyBox(box)) >= coverage(box) * leastPhoto;

/** A crop's own rounding isn't a step beyond the photo. */
const tolerance = 0.002;

/**
 * Where a crop reaches beyond its photo, such as "left and top edges", or null
 * when it stays inside.
 */
export const edgesBeyond = (crop: Box): string | null => {
  const edges = [
    ...(crop.left < -tolerance ? ['left'] : []),
    ...(crop.top < -tolerance ? ['top'] : []),
    ...(crop.right > 1 + tolerance ? ['right'] : []),
    ...(crop.bottom > 1 + tolerance ? ['bottom'] : []),
  ];
  if (edges.length === 0) {
    return null;
  }
  const names = new Intl.ListFormat('en-GB').format(edges);
  return `${names} ${edges.length === 1 ? 'edge' : 'edges'}`;
};

/** Boxes from a model are never exact. */
const closeToEdge = 0.004;

/**
 * Whether an edge of the photo cuts off what a box of a crop shows, and the
 * crop reaches beyond that edge, so that the edit completes it.
 */
export const isCompleted = (box: Box, crop: Box): boolean => {
  const photo = within(wholePicture, crop);
  return (
    (crop.left < -tolerance && box.left < photo.left + closeToEdge) ||
    (crop.top < -tolerance && box.top < photo.top + closeToEdge) ||
    (crop.right > 1 + tolerance && box.right > photo.right - closeToEdge) ||
    (crop.bottom > 1 + tolerance && box.bottom > photo.bottom - closeToEdge)
  );
};

/** What to know about versions that continue the scene. */
export const aboutBeyond = (crop: Box): ReadonlyArray<string> => {
  const edges = edgesBeyond(crop);
  return edges === null
    ? []
    : [
        `The plain grey area at the ${edges} of the original is not part of the photo. The edit was asked to fill it by continuing the scene and completing what the edge of the photo cuts off, so that is no fault and changes neither the moment nor the place. It is a fault when grey is left, when a seam shows where the photo ended, when what was completed has the wrong shape or anatomy, and when people, further animals, text or anything else that draws attention was added there.`,
      ];
};
