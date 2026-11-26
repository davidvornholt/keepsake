import { SquareSplitHorizontal } from 'lucide-react';
import type { Edit } from '../../contract.ts';
import { iconButton, tab } from '../ui/classes.ts';
import { Key } from '../ui/controls.tsx';

// Which picture of a photo is shown: the camera's, an earlier edit, or the
// one of now, and whether two of them are shown side by side.

/** The camera's picture, or a finished one: 0 is the one of now, 1 the one before. */
export type Version = 'camera' | number;

type Props = {
  readonly edit: Edit;
  readonly version: Version;
  readonly isWiping: boolean;
  readonly onVersion: (version: Version) => void;
  readonly onWipe: (isWiping: boolean) => void;
};

const iconSize = 18;

type Choice = {
  readonly version: Version;
  readonly name: string;
  /** The key that leads to it from the one of now, shown where there is a keyboard. */
  readonly key?: string;
};

const choicesOf = (edit: Edit): ReadonlyArray<Choice> => {
  const earlier = edit.earlier.map((_, at) => ({
    version: at + 1,
    name:
      edit.earlier.length === 1
        ? 'Earlier'
        : `Earlier ${edit.earlier.length - at}`,
    // V steps back through them from the one of now, so it names the latest.
    ...(at === 0 ? { key: 'V' } : {}),
  }));
  return [
    { version: 'camera', name: 'Camera', key: 'B' },
    ...earlier.toReversed(),
    { version: 0, name: 'Now' },
  ];
};

/** With many earlier pictures, the one that is shown may lie beyond the edge. */
const intoSight = (button: HTMLElement | null) => {
  const list = button?.closest('ul');
  if (button !== null && list) {
    const { offsetLeft, offsetWidth } = button;
    const middle = offsetLeft - list.offsetLeft + offsetWidth / 2;
    list.scrollLeft = middle - list.clientWidth / 2;
  }
};

export const Compare = ({
  edit,
  version,
  isWiping,
  onVersion,
  onWipe,
}: Props) => (
  <div className="flex min-w-0 items-center gap-1">
    <ul
      aria-label="Which picture"
      className="flex min-w-0 items-center overflow-x-auto"
    >
      {choicesOf(edit).map((choice) => (
        <li key={choice.version}>
          <button
            aria-keyshortcuts={choice.key}
            aria-pressed={!isWiping && version === choice.version}
            className={tab}
            ref={version === choice.version ? intoSight : undefined}
            onClick={() => {
              onWipe(false);
              onVersion(choice.version);
            }}
            type="button"
          >
            {choice.name}
            {choice.key === undefined ? null : (
              <>
                {' '}
                <Key>{choice.key}</Key>
              </>
            )}
          </button>
        </li>
      ))}
    </ul>
    <button
      aria-keyshortcuts="W"
      aria-label="Camera and edit side by side"
      aria-pressed={isWiping}
      // Where there is a keyboard, the button is wide enough for its key.
      className={`${iconButton} pointer-fine:w-auto pointer-fine:grid-flow-col pointer-fine:gap-1.5 pointer-fine:px-2.5 aria-pressed:text-lamp`}
      onClick={() => onWipe(!isWiping)}
      title="Camera and edit side by side (W)"
      type="button"
    >
      <SquareSplitHorizontal aria-hidden="true" size={iconSize} />
      <Key>W</Key>
    </button>
  </div>
);
