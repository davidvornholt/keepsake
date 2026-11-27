import { ArrowUpRight } from 'lucide-react';
import { newsOf } from '../../news-of.ts';
import type { Place } from '../app/route.ts';
import { go } from '../app/router.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { progressOf, stepName } from '../data/activity.ts';
import type { Index } from '../data/derive.ts';
import { count } from '../data/format.ts';
import { makingOf } from '../flows/making-of.ts';
import { useCarrying } from '../flows/use-carrying.ts';
import { mainButton, pencilButton, quietButton } from '../ui/classes.ts';
import { Key } from '../ui/controls.tsx';

// What wants the owner's attention now: what is new to look at, marks that
// aren't handed over, and keepsake at work on what was, or waiting for them. It stays
// in sight however far the table is scrolled. An album that is still being
// made says so at the foot of the table instead.

const iconSize = 14;

/** How what was handed over goes, and how far it is. */
const AtWork = ({
  says,
  far,
  isAsked,
  onOpen,
}: {
  readonly says: string;
  readonly far: string;
  /** Whether it can't go on without the owner. */
  readonly isAsked: boolean;
  readonly onOpen: () => void;
}) => (
  <button
    className={`type-label flex h-10 items-center gap-2.5 whitespace-nowrap px-1 ${isAsked ? 'text-wax-yellow' : 'text-pencil-blue'}`}
    onClick={onOpen}
    type="button"
  >
    {isAsked ? null : (
      <span
        aria-hidden="true"
        className="pencil-pulse size-2.5 rounded-full border-2 border-pencil-blue"
      />
    )}
    <span>{says}</span>
    {far === '' ? null : <span className="type-edge tabular">{far}</span>}
  </button>
);

/** How many moments the owner was asked to rate and hasn't. */
const toRate = (index: Index): number => {
  const { rating } = index.shoot;
  if (rating === null) {
    return 0;
  }
  const rated = new Set(rating.ratings.map(({ moment }) => moment));
  return rating.questions.filter(({ moment }) => !rated.has(moment)).length;
};

/** The album as Immich has it, in a tab of its own. */
export const AlbumLink = () => {
  const { album } = useShootContext().index.shoot;
  return album === null ? null : (
    <a
      className={`${quietButton} h-10 shrink-0 whitespace-nowrap px-1`}
      href={album.url}
      rel="noreferrer"
      target="_blank"
      title={`${album.name} in Immich`}
    >
      <span className="max-sm:sr-only">Album in Immich</span>
      <ArrowUpRight aria-hidden="true" size={iconSize} />
    </a>
  );
};

/** What keepsake is doing about what was handed over, in a few words. */
const useAtWork = () => {
  const { state } = useShootContext();
  const carrying = useCarrying();
  const { activity } = state;
  if (activity !== null) {
    return {
      says: stepName(activity),
      far: progressOf(activity),
      isAsked: false,
    };
  }
  const says = {
    'at-work': 'Keepsake is at work',
    stopped: 'Waits for you',
    idle: null,
  }[carrying.is];
  return { says, far: '', isAsked: carrying.is === 'stopped' };
};

export const Attention = ({
  sheet,
  className = '',
}: {
  readonly sheet: Place;
  readonly className?: string;
}) => {
  const { index, state } = useShootContext();
  const making = makingOf({ index, state });
  const atWork = useAtWork();
  const { marks, added } = index.shoot;
  const news = newsOf(marks, added, state.carrying).length;
  const unrated = toRate(index);
  // What is said at the foot of the table isn't said twice.
  const says = making === null ? atWork.says : null;
  const open =
    making === 'chosen'
      ? 0
      : index.shoot.marks.filter(({ handedOverAt }) => handedOverAt === null)
          .length;
  // Chosen photos that an album that is there doesn't have yet.
  const apart =
    making === null && index.hasAlbum ? index.chosen - index.inAlbum : 0;
  const to = (screen: 'hand-over' | 'news' | 'rate') => () =>
    go({ ...sheet, screen });
  if (says === null && unrated + news + open + apart === 0) {
    return null;
  }
  return (
    <div
      className={`flex min-w-0 items-center gap-x-2 sm:gap-x-3 ${className}`}
    >
      {says === null ? null : (
        <AtWork
          far={atWork.far}
          isAsked={atWork.isAsked}
          onOpen={to('hand-over')}
          says={says}
        />
      )}
      {unrated > 0 ? (
        <button
          aria-keyshortcuts="R"
          className={`${quietButton} h-10 whitespace-nowrap`}
          onClick={to('rate')}
          type="button"
        >
          Rate {count(unrated, 'moment')} <Key>R</Key>
        </button>
      ) : null}
      {news > 0 ? (
        <button
          aria-keyshortcuts="N"
          className={`${pencilButton} whitespace-nowrap`}
          onClick={to('news')}
          type="button"
        >
          {count(news, 'new thing')} <Key>N</Key>
        </button>
      ) : null}
      {open > 0 ? (
        <button
          aria-keyshortcuts="H"
          className={`${mainButton} whitespace-nowrap`}
          onClick={to('hand-over')}
          type="button"
        >
          Hand over {count(open, 'mark')} <Key>H</Key>
        </button>
      ) : null}
      {open === 0 && apart > 0 ? (
        <button
          aria-keyshortcuts="H"
          className={`${quietButton} h-10 whitespace-nowrap`}
          onClick={to('hand-over')}
          title="Chosen for the album, and not in it yet"
          type="button"
        >
          {apart} chosen, not in the album <Key>H</Key>
        </button>
      ) : null}
    </div>
  );
};
