import type { ReactNode } from 'react';
import type { Mark } from '../../contract.ts';
import { localClock } from '../data/format.ts';
import { lookOf, seedTextOf } from '../marks/kinds.ts';
import { WaxMark } from '../marks/wax-mark.tsx';
import { agentButton, sideButton } from '../ui/classes.ts';
import { Key } from '../ui/controls.tsx';
import type { Word } from './word.ts';

// What stands above the pencils of a photo. An agent's words in its blue
// pencil: that it is at work on the photo, that it has the mark, or what came
// of it. Or the owner's own words on a mark that isn't handed over, in wax.

const asked = (mark: Mark): string => {
  const { said } = lookOf[mark.kind];
  return mark.note === '' ? said : `${said}: ${mark.note}`;
};

/** What an agent says, with its dot in front and a label above, if there is one. */
const Saying = ({
  label,
  dot,
  children,
}: {
  readonly label: string | null;
  readonly dot: string;
  readonly children: ReactNode;
}) => (
  <div className="grid min-w-0 grow basis-full grid-cols-[auto_1fr] items-baseline gap-x-3 sm:basis-0">
    {label === null ? null : (
      <p className="type-edge col-start-2 mb-0.5 text-quiet">{label}</p>
    )}
    <span
      aria-hidden="true"
      className={`col-start-1 size-2 rounded-full ${dot}`}
    />
    <p className="text-pretty text-[0.9375rem] text-pencil-blue leading-snug">
      {children}
    </p>
  </div>
);

const Answered = ({
  mark,
  hasBefore,
  onBefore,
  onSeen,
}: {
  readonly mark: Mark;
  readonly hasBefore: boolean;
  readonly onBefore: () => void;
  readonly onSeen: () => void;
}) => {
  const isDone = mark.answer?.outcome === 'done';
  const note = mark.answer?.note ?? '';
  return (
    <>
      <Saying dot="bg-pencil-blue" label={asked(mark)}>
        <strong className="type-label">{isDone ? 'Done' : 'Not done'}</strong>
        {note === '' ? '' : `. ${note}`}
      </Saying>
      <div className="flex gap-3 max-sm:w-full max-sm:*:flex-1 max-sm:*:justify-center">
        {hasBefore ? (
          <button
            aria-keyshortcuts="V"
            className={sideButton}
            onClick={onBefore}
            type="button"
          >
            Before <Key>V</Key>
          </button>
        ) : null}
        <button
          aria-keyshortcuts="Enter"
          className={agentButton}
          onClick={onSeen}
          type="button"
        >
          Seen <Key>Enter</Key>
        </button>
      </div>
    </>
  );
};

const inkOf = {
  'wax-white': 'text-wax-white',
  'wax-yellow': 'text-wax-yellow',
  'wax-red': 'text-wax-red',
} as const;

/** The owner's own words. Those of a change open when they are pressed. */
const Mine = ({
  mark,
  onEdit,
}: {
  readonly mark: Mark;
  readonly onEdit: () => void;
}) => {
  const look = lookOf[mark.kind];
  const words = (
    <>
      <WaxMark
        className="mt-2 size-5 shrink-0 self-start"
        color={look.wax}
        seed={seedTextOf(mark.photo, mark.kind)}
        shape={look.shape}
      />
      <span className="min-w-0 flex-1">
        <span className="type-edge block text-quiet">
          {look.said}, not handed over yet
        </span>
        <span
          className={`mt-0.5 block text-[0.9375rem] leading-snug ${inkOf[look.wax]}`}
        >
          {mark.note}
        </span>
      </span>
    </>
  );
  const shape = 'flex min-w-0 flex-1 items-center gap-3 text-left';
  return mark.kind === 'change' ? (
    <button
      className={`${shape} rounded-[3px] py-1.5 hover:bg-raised`}
      onClick={onEdit}
      title="Change the words"
      type="button"
    >
      {words}
    </button>
  ) : (
    <p className={shape}>{words}</p>
  );
};

type Props = {
  readonly word: Word;
  /** Whether there is an earlier finished photo to compare with. */
  readonly hasBefore: boolean;
  readonly onBefore: () => void;
  readonly onSeen: () => void;
  readonly onEdit: () => void;
};

const Said = ({ word, onEdit, ...answered }: Props) => {
  if (word.kind === 'working') {
    return (
      <Saying dot="agent-pulse border-2 border-pencil-blue" label={null}>
        An agent is working on this photo.
      </Saying>
    );
  }
  if (word.kind === 'waiting') {
    const { handedOverAt, madeAt } = word.mark;
    return (
      <Saying
        dot="border-2 border-pencil-blue"
        label={`Handed over at ${localClock(handedOverAt ?? madeAt)}`}
      >
        {asked(word.mark)}
      </Saying>
    );
  }
  return word.kind === 'mine' ? (
    <Mine mark={word.mark} onEdit={onEdit} />
  ) : (
    <Answered mark={word.mark} {...answered} />
  );
};

/** All of it is there to be read, however long it is: the photo makes room. */
export const Words = (props: Props) => (
  <div className="mx-auto flex min-h-16 w-full max-w-[46rem] flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-1.5 sm:flex-nowrap">
    <Said {...props} />
  </div>
);
