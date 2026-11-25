import { Undo2 } from 'lucide-react';
import { useShootContext } from '../app/shoot-context.ts';
import { count, dollarsOf, localClock } from '../data/format.ts';
import { lookOf, seedTextOf } from '../marks/kinds.ts';
import { WaxMark } from '../marks/wax-mark.tsx';
import { quietButton } from '../ui/classes.ts';
import { PhotoLink } from '../ui/photo-link.tsx';
import type { Line } from './ledger.ts';

// One mark in the list: the photo, the mark as it was drawn on it, what it
// asks for, and how far it has got.

const iconSize = 16;
/** The agent's pencil is finer than the owner's wax. */
const pencilWeight = 0.42;

export type Going = {
  /** When the agent's pencil gets to this mark, in milliseconds. */
  readonly since: number;
};

type Props = {
  readonly line: Line;
  /** Set while the mark is being handed over, and null once an agent has it. */
  readonly going: Going | null;
  readonly isOpen: boolean;
  readonly isWorkedOn: boolean;
};

const Asked = ({ line }: { readonly line: Line }) => {
  const { mark, other } = line;
  const look = lookOf[mark.kind];
  const boxes = mark.boxes.length;
  return (
    <div className="min-w-0 flex-1">
      <p className="flex flex-wrap items-center gap-x-2 text-lamp">
        {look.said}
        {other === null ? null : (
          <>
            <span className="text-quiet">in place of</span>
            <PhotoLink className="h-8" how="push" photo={other.id} />
          </>
        )}
      </p>
      {mark.note === '' ? null : (
        <p className="mt-0.5 line-clamp-3 text-print">{mark.note}</p>
      )}
      {boxes === 0 ? null : (
        <p className="type-edge mt-1 text-quiet">
          {count(boxes, 'box', 'boxes')} drawn on it
        </p>
      )}
    </div>
  );
};

const State = ({ line, isOpen, isWorkedOn }: Omit<Props, 'going'>) => {
  const { store, index } = useShootContext();
  const { mark, costs } = line;
  if (!isOpen) {
    return (
      <p className="type-edge shrink-0 text-pencil-blue">
        {isWorkedOn
          ? 'Being worked on'
          : `Handed over ${localClock(mark.handedOverAt ?? mark.madeAt)}`}
      </p>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-3 sm:gap-5">
      {costs ? (
        <p className="type-edge tabular text-quiet">
          About {dollarsOf(index.shoot.dollars.perEdit)}
        </p>
      ) : null}
      <button
        aria-label={`Take back: ${lookOf[mark.kind].said}, photo ${index.numberOf.get(mark.photo) ?? 0}`}
        className={`${quietButton} min-h-10 whitespace-nowrap`}
        disabled={mark.handedOverAt !== null}
        onClick={() => {
          store.takeBack(mark).catch(() => undefined);
        }}
        type="button"
      >
        <Undo2 aria-hidden="true" className="sm:hidden" size={iconSize} />
        <span className="max-sm:sr-only">Take back</span>
      </button>
    </div>
  );
};

export const LedgerRow = ({ line, going, isOpen, isWorkedOn }: Props) => {
  const { mark, photo } = line;
  const look = lookOf[mark.kind];
  const hasRing = !isOpen || going !== null;
  return (
    <li
      className="flex items-center gap-8 border-raised border-t py-2.5 first:border-t-0 sm:gap-9"
      data-row={mark.id}
    >
      <span className="relative flex w-[4.5rem] shrink-0 justify-end sm:w-24">
        <PhotoLink
          className="h-12 max-w-full sm:h-16"
          how="push"
          photo={photo.id}
        />
        {/* The mark lies over the edge of the frame, as it was drawn. */}
        <span className="pointer-events-none absolute top-1/2 right-0 grid size-12 translate-x-1/2 -translate-y-1/2 place-items-center">
          <WaxMark
            className="size-7"
            color={look.wax}
            seed={seedTextOf(mark.photo, mark.kind)}
            shape={look.shape}
          />
          {hasRing ? (
            <WaxMark
              className={`absolute inset-0 size-12 ${isWorkedOn ? 'agent-pulse' : ''}`}
              color="pencil-blue"
              seed={`${mark.id}:agent`}
              shape="circle"
              since={going?.since ?? null}
              weight={pencilWeight}
            />
          ) : null}
        </span>
      </span>
      <Asked line={line} />
      <State isOpen={isOpen} isWorkedOn={isWorkedOn} line={line} />
    </li>
  );
};
