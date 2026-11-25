import { useMemo, useState } from 'react';
import type { Box, MarkKind, PhotoView } from '../../contract.ts';
import { type Index, isFavorite, markedIn } from '../data/derive.ts';
import { seedOf } from '../marks/glyphs.ts';
import { lookOf, seedTextOf } from '../marks/kinds.ts';
import type { Draft } from './composer.tsx';
import type { Ink, Stamp } from './ink.ts';

// What is drawn on a photo that is looked at, from the marks it has and the
// change that is being written.

const longAgo = Number.NEGATIVE_INFINITY;

type Wanted = {
  readonly index: Index;
  readonly photo: PhotoView;
  /** The change being written, whose boxes stand for the saved ones. */
  readonly draft: Draft | null;
  readonly printed: Box | null;
};

type Seen = { readonly since: Map<string, number>; isFirst: boolean };

const stampOf = (
  photo: string,
  kind: MarkKind,
  since: number,
  corner: Stamp['corner'],
): Stamp => {
  const look = lookOf[kind];
  return {
    shape: look.shape,
    seed: seedOf(seedTextOf(photo, kind)),
    wax: look.wax,
    since,
    corner,
  };
};

/** The mark a photo shows large: the one that can be taken back, or the one an agent has. */
const markOf = (index: Index, photo: string) => {
  const { open, waiting } = markedIn(index, photo);
  return (
    open ??
    waiting.findLast(
      ({ kind }) => kind !== 'favorite' && kind !== 'not-favorite',
    ) ??
    null
  );
};

export const useInk = ({
  index,
  photo,
  draft,
  printed,
}: Wanted): Omit<Ink, 'draft'> => {
  // When each thing was first seen here, so that only what is new is drawn
  // by hand, and what was there is simply there.
  const [seen] = useState<Seen>(() => ({ since: new Map(), isFirst: true }));
  const mark = markOf(index, photo.id);
  const isStarred = isFavorite(index, photo);
  const { favorite } = markedIn(index, photo.id);

  return useMemo(() => {
    const sinceOf = (key: string): number => {
      const known = seen.since.get(key);
      if (known !== undefined) {
        return known;
      }
      const since = seen.isFirst ? longAgo : performance.now();
      seen.since.set(key, since);
      return since;
    };
    const stamps: Array<Stamp> = [];
    if (mark !== null && draft === null) {
      stamps.push(
        stampOf(photo.id, mark.kind, sinceOf(`mark:${mark.kind}`), 'mark'),
      );
    }
    if (favorite?.kind === 'not-favorite') {
      stamps.push(
        stampOf(photo.id, 'not-favorite', sinceOf('not-favorite'), 'star'),
      );
    } else if (isStarred) {
      stamps.push(stampOf(photo.id, 'favorite', sinceOf('favorite'), 'star'));
    }
    const saved = (mark?.kind === 'change' ? mark.boxes : []).map((box) => ({
      box,
      since: sinceOf(`box:${box.left}:${box.top}`),
    }));
    const boxSeed = (at: number) => seedOf(`${photo.id}:box:${at}`);
    const boxes = (draft?.boxes ?? saved).map(({ box, since }, at) => {
      // A box stays as it was drawn when the change is saved.
      seen.since.set(`box:${box.left}:${box.top}`, since);
      return { box, since, seed: boxSeed(at) };
    });
    seen.isFirst = false;
    return { stamps, boxes, nextBox: boxSeed(boxes.length), printed };
  }, [seen, mark, favorite, isStarred, draft, printed, photo.id]);
};
