import { ArrowUpRight } from 'lucide-react';
import type { Place } from '../app/route.ts';
import { go } from '../app/router.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { progressOf, stepName } from '../data/activity.ts';
import type { Index } from '../data/derive.ts';
import { count } from '../data/format.ts';
import { makingOf } from '../flows/making-of.ts';
import { useAgent } from '../flows/use-agent.ts';
import { agentButton, mainButton, quietButton } from '../ui/classes.ts';
import { Key } from '../ui/controls.tsx';

// What wants the owner's attention now: answers of an agent to look at,
// marks that aren't handed over, and an agent at work on what was. It stays
// in sight however far the table is scrolled. An album that is still being
// made says so at the foot of the table instead.

const iconSize = 14;

/** Who acts on what was handed over, and how far they are. */
const AtWork = ({
  says,
  far,
  isAsked,
  onOpen,
}: {
  readonly says: string;
  readonly far: string;
  /** Whether no agent took it, so that the owner has to ask one. */
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
        className="agent-pulse size-2.5 rounded-full border-2 border-pencil-blue"
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

/** What an agent is doing about what was handed over, in a few words. */
const useAtWork = () => {
  const { state } = useShootContext();
  const agent = useAgent();
  const { activity } = state;
  if (activity !== null) {
    return {
      says: stepName(activity),
      far: progressOf(activity),
      isAsked: false,
    };
  }
  const says = {
    'at-work': 'An agent is at work',
    starting: 'Starting an agent',
    ask: 'No agent took it yet',
    idle: null,
  }[agent.is];
  return { says, far: '', isAsked: agent.is === 'ask' };
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
  const agent = useAtWork();
  const news = index.shoot.marks.filter(
    ({ answer, seenAt }) => answer !== null && seenAt === null,
  ).length;
  const unrated = toRate(index);
  // What is said at the foot of the table isn't said twice.
  const says = making === null ? agent.says : null;
  const open =
    making === 'chosen'
      ? 0
      : index.shoot.marks.filter(({ handedOverAt }) => handedOverAt === null)
          .length;
  // Chosen photos that an album that is there doesn't have yet.
  const apart =
    making === null && index.hasAlbum ? index.chosen - index.inAlbum : 0;
  const to = (screen: 'hand-over' | 'answers' | 'rate') => () =>
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
          far={agent.far}
          isAsked={agent.isAsked}
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
          className={`${agentButton} whitespace-nowrap`}
          onClick={to('answers')}
          type="button"
        >
          {count(news, 'answer')} <Key>N</Key>
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
