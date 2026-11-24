import { clamp, coverage, ordered, tidyBox } from '../../shared/boxes.ts';
import type { Box } from '../../shared/domain.ts';

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
