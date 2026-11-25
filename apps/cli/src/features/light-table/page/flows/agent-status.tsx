import { ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { useShootContext } from '../app/shoot-context.ts';
import { count, dollarsOf } from '../data/format.ts';
import { mainButton } from '../ui/classes.ts';
import { Meter } from '../ui/controls.tsx';
import type { AgentState } from './ledger.ts';
import { Sentence } from './sentence.tsx';
import { useAgent, whyAsk } from './use-agent.ts';
import { Working } from './working.tsx';

// Who acts on what was handed over, and how far they are. The page starts
// an agent itself; only when it can't does the owner have to ask one.

const iconSize = 14;
const Pulse = () => (
  <span
    aria-hidden="true"
    className="agent-pulse size-2.5 shrink-0 rounded-full border-2 border-pencil-blue"
  />
);

/** How far the album that was ordered has got. */
const Ordered = () => {
  const { index } = useShootContext();
  const { ordered, photos } = index.shoot;
  if (ordered === null) {
    return null;
  }
  const picked = photos.filter(({ standing }) => standing.kind === 'picked');
  const edited = picked.filter(({ edit }) => edit !== null).length;
  const whole = picked.length;
  return (
    <div className="mt-4">
      <p className="flex flex-wrap items-baseline gap-x-3 text-print">
        <span>
          {index.hasAlbum ? 'More photos are' : 'The album is'} ordered, for at
          most {dollarsOf(ordered.dollars)}.
        </span>
        <span className="type-edge tabular text-quiet">
          {edited} of {count(whole, 'photo')} edited
        </span>
      </p>
      <Meter
        className="mt-2 w-full"
        label={`${edited} of ${whole} photos edited`}
        share={whole === 0 ? 0 : edited / whole}
      />
      <p className="mt-2 text-quiet">
        Finished photos go into the album in Immich together, at the end.
      </p>
    </div>
  );
};

/** What the owner does to get an agent: press once more, or say it to one. */
const Ask = ({
  agent,
}: {
  readonly agent: Extract<AgentState, { is: 'ask' }>;
}) => {
  const { state, store } = useShootContext();
  const [isAsking, setIsAsking] = useState(false);
  const why = whyAsk(agent);
  if (!state.agent.canStart) {
    return <Sentence lead={`${why} Say this to one, and it does the rest:`} />;
  }
  const onStart = () => {
    setIsAsking(true);
    store
      .startAgent()
      .catch(() => undefined)
      .finally(() => setIsAsking(false));
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="min-w-0 flex-1 basis-64 text-print">{why}</p>
        <button
          className={`${mainButton} shrink-0 whitespace-nowrap`}
          disabled={isAsking}
          onClick={onStart}
          type="button"
        >
          Start an agent
        </button>
      </div>
      <Sentence lead="Or say this to one yourself:" />
    </div>
  );
};

/** What the agent does about what it was given, or what the owner does to get one. */
export const AgentStatus = () => {
  const { state } = useShootContext();
  const agent = useAgent();
  if (agent.is === 'idle') {
    return state.activity === null ? null : (
      <Working activity={state.activity} />
    );
  }
  return (
    <div>
      {agent.is === 'ask' ? (
        <Ask agent={agent} />
      ) : (
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-pencil-blue">
          <Pulse />
          <span>
            {agent.is === 'starting'
              ? 'Starting an agent'
              : 'An agent is at work.'}
          </span>
          {agent.is === 'at-work' && agent.link !== null ? (
            <a
              className="type-label inline-flex min-h-10 items-center gap-1 underline decoration-1 underline-offset-4 hover:text-lamp"
              href={agent.link}
              rel="noreferrer"
              target="_blank"
            >
              Read along
              <ArrowUpRight aria-hidden="true" size={iconSize} />
            </a>
          ) : null}
        </p>
      )}
      {state.activity === null ? null : (
        <div className="mt-3">
          <Working activity={state.activity} />
        </div>
      )}
      <Ordered />
    </div>
  );
};
