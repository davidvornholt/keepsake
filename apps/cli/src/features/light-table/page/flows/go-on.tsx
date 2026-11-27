import { useState } from 'react';
import { useShootContext } from '../app/shoot-context.ts';
import { dollarsOf } from '../data/format.ts';
import { mainButton } from '../ui/classes.ts';
import type { CarryingState } from './ledger.ts';

// The owner's word to go on with what stopped: once more, or with more money.

type Stopped = Extract<CarryingState, { is: 'stopped' }>;

/** What the button says. */
const goOnSaid = ({ stopped, more }: Stopped): string =>
  stopped.needs === 'money'
    ? `Go on, at most ${dollarsOf(more)} more`
    : 'Go on';

export const GoOn = ({
  carrying,
  className = mainButton,
}: {
  readonly carrying: Stopped;
  readonly className?: string;
}) => {
  const { store } = useShootContext();
  const [isGoing, setIsGoing] = useState(false);
  return (
    <button
      className={`${className} shrink-0 whitespace-nowrap`}
      disabled={isGoing}
      onClick={() => {
        setIsGoing(true);
        store
          .goOnCarrying(carrying.stopped.id, carrying.more)
          .catch(() => undefined)
          .finally(() => setIsGoing(false));
      }}
      type="button"
    >
      {isGoing ? 'Going on' : goOnSaid(carrying)}
    </button>
  );
};
