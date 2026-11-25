import { ArrowUpRight } from 'lucide-react';
import type { Activity } from '../../contract.ts';
import type { Place } from '../app/route.ts';
import { go } from '../app/router.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { progressOf, stepName } from '../data/activity.ts';
import { attentionOf } from '../data/derive.ts';
import { count } from '../data/format.ts';
import { agentButton, mainButton, quietButton } from '../ui/classes.ts';
import { Key } from '../ui/controls.tsx';

// What wants the owner's attention now: answers of an agent to look at,
// marks that aren't handed over, and an agent at work. It stays in sight
// however far the table is scrolled.

const iconSize = 14;

const Working = ({
  activity,
  onOpen,
}: {
  readonly activity: Activity;
  readonly onOpen: () => void;
}) => (
  <button
    className="type-label flex h-10 items-center gap-2.5 whitespace-nowrap px-1 text-pencil-blue"
    onClick={onOpen}
    type="button"
  >
    <span
      aria-hidden="true"
      className="agent-pulse size-2.5 rounded-full border-2 border-pencil-blue"
    />
    <span>{stepName(activity)}</span>
    <span className="type-edge tabular">{progressOf(activity)}</span>
  </button>
);

/** How many moments the owner was asked to rate and hasn't. */
const toRate = (index: ReturnType<typeof useShootContext>['index']): number => {
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

export const Attention = ({
  sheet,
  className = '',
}: {
  readonly sheet: Place;
  readonly className?: string;
}) => {
  const { index, state } = useShootContext();
  const { news, wishes, waiting } = attentionOf(index.shoot.marks);
  const open = wishes.length;
  const unrated = toRate(index);
  const isHandedOver = state.activity === null && waiting.length > 0;
  const to = (screen: 'hand-over' | 'answers' | 'rate') => () =>
    go({ ...sheet, screen });
  if (
    state.activity === null &&
    !isHandedOver &&
    unrated + news.length + open === 0
  ) {
    return null;
  }
  return (
    <div
      className={`flex min-w-0 items-center gap-x-2 sm:gap-x-3 ${className}`}
    >
      {state.activity === null ? null : (
        <Working activity={state.activity} onOpen={to('hand-over')} />
      )}
      {isHandedOver ? (
        <button
          className={`${quietButton} h-10 whitespace-nowrap text-pencil-blue hover:text-pencil-blue`}
          onClick={to('hand-over')}
          type="button"
        >
          {waiting.length} handed over
        </button>
      ) : null}
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
      {news.length > 0 ? (
        <button
          aria-keyshortcuts="N"
          className={`${agentButton} whitespace-nowrap`}
          onClick={to('answers')}
          type="button"
        >
          {count(news.length, 'answer')} <Key>N</Key>
        </button>
      ) : null}
      {open > 0 ? (
        <button
          aria-keyshortcuts="H"
          className={`${mainButton} whitespace-nowrap`}
          onClick={to('hand-over')}
          type="button"
        >
          Hand over {count(open, 'mark')}
        </button>
      ) : null}
    </div>
  );
};
