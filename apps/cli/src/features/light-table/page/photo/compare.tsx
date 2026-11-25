import { SquareSplitHorizontal } from 'lucide-react';
import type { Edit } from '../../contract.ts';
import { iconButton, tab } from '../ui/classes.ts';

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

const namesOf = (
  edit: Edit,
): ReadonlyArray<{ readonly version: Version; readonly name: string }> => {
  const earlier = edit.earlier.map((_, at) => ({
    version: at + 1,
    name:
      edit.earlier.length === 1
        ? 'Earlier'
        : `Earlier ${edit.earlier.length - at}`,
  }));
  return [
    { version: 'camera', name: 'Camera' },
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
      {namesOf(edit).map((choice) => (
        <li key={choice.version}>
          <button
            aria-keyshortcuts={choice.version === 'camera' ? 'B' : undefined}
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
          </button>
        </li>
      ))}
    </ul>
    <button
      aria-keyshortcuts="W"
      aria-label="Camera and edit side by side"
      aria-pressed={isWiping}
      className={`${iconButton} aria-pressed:text-lamp`}
      onClick={() => onWipe(!isWiping)}
      title="Camera and edit side by side (W)"
      type="button"
    >
      <SquareSplitHorizontal aria-hidden="true" size={iconSize} />
    </button>
  </div>
);
