import { X } from 'lucide-react';
import type { Choice } from '../../contract.ts';
import { useShootContext } from '../app/shoot-context.ts';
import type { Index } from '../data/derive.ts';
import { iconButton } from '../ui/classes.ts';
import { Placed } from '../ui/placed.tsx';
import { useWindowSize } from '../ui/use-window.ts';

// What went wrong, said where it can't be missed and doesn't get in the way:
// right below what is at the top, where nothing is pressed. That is also
// where a photo the owner put in or took out says that it couldn't be.

const iconSize = 16;

const gap = 8;
const shape = 'pointer-events-none z-50 flex items-start justify-center px-3';

const lost = 'The connection to Keepsake is lost. Trying again.';

/** Why a photo isn't where the owner wanted it. */
const failedWords = (index: Index, { photo, wants, failed }: Choice) => {
  const number = index.numberOf.get(photo) ?? 0;
  const not = wants === 'out' ? 'taken out' : 'put in';
  return `Photo ${number} wasn’t ${not}: ${failed ?? ''}`;
};

export const Notices = ({
  below,
}: {
  /** How much of the window what is at the top takes. */
  readonly below: number;
}) => {
  const { index, state, store } = useShootContext();
  const { width } = useWindowSize();
  const { problem, isConnected, hint } = state;
  const place = { x: 0, y: below + gap, w: width, h: 0 };
  const failed = index.shoot.choices.find((one) => one.failed !== null);
  if (problem === null && isConnected && failed === undefined) {
    return hint === null ? null : (
      <Placed className={shape} rect={place}>
        <p
          className="type-label flex min-h-11 max-w-[40rem] items-center bg-raised px-4 py-2 text-lamp shadow-[0_6px_24px_var(--color-shade)]"
          role="status"
        >
          {hint}
        </p>
      </Placed>
    );
  }
  const shown = problem === null && isConnected ? failed : undefined;
  const said =
    problem ?? (shown === undefined ? lost : failedWords(index, shown));
  const dismissShown =
    shown === undefined
      ? null
      : () => {
          store.dismissChoice(shown.action).catch(() => undefined);
        };
  const dismiss = problem === null ? dismissShown : store.dismissProblem;
  return (
    <Placed className={shape} rect={place}>
      <p
        className="pointer-events-auto flex min-h-11 max-w-[40rem] items-center gap-3 bg-lamp py-1 pr-1 pl-4 text-sheet shadow-[0_6px_24px_var(--color-shade)]"
        role="status"
      >
        <span className="py-1.5">{said}</span>
        {dismiss === null ? (
          <span className="w-2" />
        ) : (
          <button
            aria-label="Dismiss"
            className={`${iconButton} text-sheet hover:bg-print hover:text-sheet`}
            onClick={dismiss}
            type="button"
          >
            <X aria-hidden="true" size={iconSize} />
          </button>
        )}
      </p>
    </Placed>
  );
};
