import { Undo2 } from 'lucide-react';
import { useShootContext } from '../app/shoot-context.ts';
import { count, dollarsOf } from '../data/format.ts';
import { mainButton, quietButton } from '../ui/classes.ts';
import { Key } from '../ui/controls.tsx';
import type { Ledger } from './ledger.ts';

// What handing over comes to, and the button that does it.

const iconSize = 16;

/** How many photos the album has afterwards, when the marks change that. */
const Album = ({ ledger }: { readonly ledger: Ledger }) => {
  const { chosen, chosenAfter, limit } = ledger;
  if (chosen === chosenAfter) {
    return null;
  }
  const isOver = limit !== null && chosenAfter > limit;
  return (
    <span className={isOver ? 'text-wax-yellow' : ''}>
      {ledger.isFirst ? 'Chosen' : 'Album'} {chosen} to {chosenAfter}
      {limit === null ? '' : ` of ${limit}`}
    </span>
  );
};

/** Who acts on it, said before it is handed over. */
const whoOf = ({
  waitsSince,
  canStart,
}: {
  readonly waitsSince: string | null;
  readonly canStart: boolean;
}): string => {
  if (waitsSince !== null) {
    return 'An agent waits and starts at once';
  }
  return canStart
    ? 'An agent is started for it'
    : 'You get a sentence to give to an agent';
};

/** What the button says and what pressing it costs at most. */
const askOf = (ledger: Ledger): { readonly says: string; cost: string } => {
  const marks = ledger.open.length;
  const about = `about ${dollarsOf(ledger.dollars)}`;
  if (ledger.edits === 0) {
    const says = ledger.isFirst ? 'Make the album' : 'Put into the album';
    return {
      says: ledger.ordersAlbum ? says : `Hand over ${count(marks, 'mark')}`,
      cost: 'Costs nothing',
    };
  }
  return ledger.ordersAlbum
    ? {
        says: `Edit ${count(ledger.edits, 'photo')}, ${about}`,
        cost: `About ${dollarsOf(ledger.dollars)} at most`,
      }
    : {
        says: `Hand over ${count(marks, 'mark')}`,
        cost: `${count(ledger.edits, 'edit')}, ${about}`,
      };
};

type Props = {
  readonly ledger: Ledger;
  readonly isGoing: boolean;
  /** How many marks were handed over just now, if any were. */
  readonly handed: number | null;
  readonly onHandOver: () => void;
  readonly onClose: () => void;
};

export const HandOverFoot = ({
  ledger,
  isGoing,
  handed,
  onHandOver,
  onClose,
}: Props) => {
  const { state, store } = useShootContext();
  const hasSomething = ledger.open.length > 0 || ledger.ordersAlbum;
  const ask = askOf(ledger);
  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3 border-raised border-t px-5 py-3.5 sm:px-7">
      <p aria-live="polite" className="sr-only">
        {handed === null ? '' : 'Handed over.'}
      </p>
      {hasSomething ? (
        <p className="type-edge tabular mr-auto flex flex-wrap gap-x-4 gap-y-1 text-quiet">
          <span>{ask.cost}</span>
          <Album ledger={ledger} />
          <span>{whoOf(state.agent)}</span>
        </p>
      ) : (
        <p className="type-edge mr-auto text-quiet">
          Nothing changes until an agent has acted
        </p>
      )}
      {state.undoable === null ? null : (
        <button
          aria-keyshortcuts="U"
          className={`${quietButton} min-h-10`}
          onClick={() => {
            store.undo().catch(() => undefined);
          }}
          type="button"
        >
          <Undo2 aria-hidden="true" size={iconSize} />
          Undo <Key>U</Key>
        </button>
      )}
      {hasSomething ? (
        <button
          aria-keyshortcuts="Enter"
          className={`${mainButton} whitespace-nowrap`}
          disabled={isGoing}
          onClick={onHandOver}
          type="button"
        >
          {isGoing ? 'Handing over' : ask.says}
        </button>
      ) : (
        <button
          aria-keyshortcuts="Escape"
          className={mainButton}
          onClick={onClose}
          type="button"
        >
          Back to the table
        </button>
      )}
    </footer>
  );
};
