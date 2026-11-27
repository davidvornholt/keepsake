import {
  percentOf,
  preparedAtLeast,
  preparedShare,
  progressOf,
  stepName,
} from '../data/activity.ts';
import { count, span } from '../data/format.ts';
import type { ShootSummary } from './use-shoots.ts';

// What stands under an album on the shelf: when it was, how much of it
// there is, and what waits there.

/** When it was, and how much of it there is, as on the edge of a film. */
export const printOf = (shoot: ShootSummary): ReadonlyArray<string> => [
  ...(shoot.from === null || shoot.to === null
    ? []
    : [span(shoot.from, shoot.to)]),
  ...(shoot.photos === 0 ? [] : [count(shoot.photos, 'photo')]),
  ...(shoot.inAlbum === 0 ? [] : [`${shoot.inAlbum} in the album`]),
];

/** Something that waits at an album, or goes on there. */
export type Waits = {
  readonly text: string;
  /** More about it, such as why it stopped. */
  readonly more: string | null;
  /**
   * Who it concerns: the owner has to do something, an agent or keepsake is
   * at it, or it is only worth knowing.
   */
  readonly who: 'owner' | 'agent' | 'keepsake' | 'nobody';
};

const waits = (
  text: string,
  who: Waits['who'],
  more: string | null = null,
): Waits => ({ text, who, more });

/** How far getting an album ready has got, from 0 to 1. */
export const readyShare = (shoot: ShootSummary): number =>
  Math.max(
    preparedShare(shoot.activity),
    preparedAtLeast({ photos: shoot.photos, chosen: shoot.picked }).share,
  );

/** What is said between two steps, when nothing says what goes on. */
const between = ({ photos }: ShootSummary): string | null =>
  photos === 0 ? 'Starting' : null;

/** How far an album that is being made ready has got, or why it stopped. */
const gettingReady = (shoot: ShootSummary): Waits => {
  const stopped = shoot.preparation?.stopped ?? null;
  return stopped === null
    ? waits(
        `Preparing, ${percentOf(readyShare(shoot))}`,
        'keepsake',
        shoot.activity === null
          ? between(shoot)
          : [stepName(shoot.activity), progressOf(shoot.activity)]
              .filter((part) => part !== '')
              .join(', '),
      )
    : waits('Stopped', 'owner', stopped);
};

/** What an agent does there, in a few words. */
const atWork = (shoot: ShootSummary): ReadonlyArray<Waits> => {
  const { activity } = shoot;
  if (shoot.isOrdered) {
    const far =
      activity?.step === 'edit' && activity.total > 0
        ? `, ${progressOf(activity)}`
        : '';
    return [waits(`Being edited${far}`, 'agent')];
  }
  return activity === null ? [] : [waits(stepName(activity), 'agent')];
};

/**
 * What waits at an album, the most pressing first. Nothing for an album
 * that is finished and left alone.
 */
export const waitsOf = (shoot: ShootSummary): ReadonlyArray<Waits> => {
  if (shoot.preparation !== null) {
    return [gettingReady(shoot)];
  }
  if (shoot.photos === 0) {
    return [waits('No photos yet', 'nobody')];
  }
  if (shoot.inAlbum === 0 && shoot.picked === 0 && shoot.activity === null) {
    return [waits('Nothing chosen yet', 'nobody')];
  }
  return [
    ...atWork(shoot),
    ...(shoot.picked > 0 && !shoot.isOrdered
      ? [
          waits(
            shoot.inAlbum === 0
              ? `${shoot.picked} chosen, ready for your look`
              : `${shoot.picked} chosen, not in the album yet`,
            'owner',
          ),
        ]
      : []),
    ...(shoot.newAnswers > 0
      ? [waits(count(shoot.newAnswers, 'new answer'), 'agent')]
      : []),
    ...(shoot.openMarks > 0
      ? [waits(`${count(shoot.openMarks, 'mark')} to hand over`, 'owner')]
      : []),
  ];
};

/** Whether something goes on at an album that the shelf should follow. */
export const isBusy = (shoot: ShootSummary): boolean =>
  shoot.isOrdered ||
  shoot.activity !== null ||
  (shoot.preparation !== null && shoot.preparation.stopped === null);

/** The whole of it in one sentence, for whoever can't see the page. */
export const sentenceOf = (shoot: ShootSummary): string =>
  [
    shoot.title ?? shoot.name,
    ...printOf(shoot),
    ...waitsOf(shoot).map(({ text, more }) =>
      more === null ? text : `${text}: ${more}`,
    ),
  ].join(', ');
