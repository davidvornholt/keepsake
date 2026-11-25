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
      Album {chosen} to {chosenAfter}
      {limit === null ? '' : ` of ${limit}`}
    </span>
  );
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
  const marks = ledger.open.length;
  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3 border-raised border-t px-5 py-3.5 sm:px-7">
      <p aria-live="polite" className="sr-only">
        {handed === null ? '' : `${count(handed, 'mark')} handed over.`}
      </p>
      {marks === 0 ? (
        <p className="type-edge mr-auto text-quiet">
          Nothing changes until an agent has acted
        </p>
      ) : (
        <p className="type-edge tabular mr-auto flex flex-wrap gap-x-4 gap-y-1 text-quiet">
          <span>
            {ledger.edits === 0
              ? 'Costs nothing'
              : `${count(ledger.edits, 'edit')}, about ${dollarsOf(ledger.dollars)}`}
          </span>
          <Album ledger={ledger} />
          <span>
            {state.agentWaitsSince === null
              ? 'No agent is waiting'
              : 'An agent starts at once'}
          </span>
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
      {marks === 0 ? (
        <button
          aria-keyshortcuts="Escape"
          className={`${mainButton}`}
          onClick={onClose}
          type="button"
        >
          Back to the table
        </button>
      ) : (
        <button
          aria-keyshortcuts="Enter"
          className={`${mainButton} whitespace-nowrap`}
          disabled={isGoing}
          onClick={onHandOver}
          type="button"
        >
          {isGoing ? 'Handing over' : `Hand over ${count(marks, 'mark')}`}
        </button>
      )}
    </footer>
  );
};
