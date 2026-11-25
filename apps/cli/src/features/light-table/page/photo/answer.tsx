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
      <div className="min-w-0 flex-1">
        <p className="type-edge truncate text-quiet">{asked(mark)}</p>
        <p className="mt-0.5 line-clamp-2 text-[0.9375rem] text-pencil-blue leading-snug">
          <strong className="type-label">{isDone ? 'Done' : 'Not done'}</strong>
          {note === '' ? '' : `. ${note}`}
        </p>
      </div>
      {hasBefore ? (
        <button
          aria-keyshortcuts="V"
          className={`${sideButton} shrink-0`}
          onClick={onBefore}
          type="button"
        >
          Before <Key>V</Key>
        </button>
      ) : null}
      <button
        aria-keyshortcuts="Enter"
        className={`${agentButton} shrink-0`}
        onClick={onSeen}
        type="button"
      >
        Seen <Key>Enter</Key>
      </button>
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
        className="size-5 shrink-0"
        color={look.wax}
        seed={seedTextOf(mark.photo, mark.kind)}
        shape={look.shape}
      />
      <span className="min-w-0 flex-1">
        <span className="type-edge block truncate text-quiet">
          {look.said}, not handed over yet
        </span>
        <span
          className={`mt-0.5 line-clamp-2 text-[0.9375rem] leading-snug ${inkOf[look.wax]}`}
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

const FromAgent = ({
  word,
  hasBefore,
  onBefore,
  onSeen,
}: Omit<Props, 'word' | 'onEdit'> & {
  readonly word: Exclude<Word, { readonly kind: 'mine' }>;
}) => (
  <>
    <span
      aria-hidden="true"
      className={`size-2.5 shrink-0 rounded-full ${
        word.kind === 'answer'
          ? 'bg-pencil-blue'
          : 'border-2 border-pencil-blue'
      } ${word.kind === 'working' ? 'agent-pulse' : ''}`}
    />
    {word.kind === 'answer' ? (
      <Answered
        hasBefore={hasBefore}
        mark={word.mark}
        onBefore={onBefore}
        onSeen={onSeen}
      />
    ) : (
      <p className="min-w-0 flex-1 truncate text-pencil-blue">
        {word.kind === 'working'
          ? 'An agent is working on this photo.'
          : `Handed over at ${localClock(word.mark.handedOverAt ?? word.mark.madeAt)}. ${asked(word.mark)}`}
      </p>
    )}
  </>
);

export const Words = ({ word, onEdit, ...agent }: Props) => (
  <div
    aria-live="polite"
    className="mx-auto flex h-16 w-full max-w-[44rem] items-center gap-3 px-3"
  >
    {word.kind === 'mine' ? (
      <Mine mark={word.mark} onEdit={onEdit} />
    ) : (
      <FromAgent word={word} {...agent} />
    )}
  </div>
);
