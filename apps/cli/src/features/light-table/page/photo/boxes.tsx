import { X } from 'lucide-react';
import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useEffectEvent,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { Box } from '../../contract.ts';
import type { Rect } from '../sheet/layout.ts';
import { type Handle, handles, isSameBox, nudged } from './box-edit.ts';
import { type Holding, holdOf, leastSide, useGrab } from './box-grab.ts';

// The boxes of a change, to be taken hold of: each can be chosen, moved,
// pulled at its sides and corners, and removed on its own. What is seen of
// a box is its wax, drawn on the photo; this lies over it and is what the
// hand and the keyboard reach. Inside a box that isn't chosen there is
// nothing, so that another box can be drawn over it.

export type BoxesHandle = {
  /** Says where the photo the boxes are drawn on is on the screen. */
  readonly follow: (photo: Rect) => void;
};

type Props = {
  readonly boxes: ReadonlyArray<{ readonly box: Box }>;
  /** Which box is chosen, if one is. */
  readonly selected: number | null;
  /** Where the photo is when the boxes are first shown. */
  readonly initial: Rect | null;
  readonly onSelect: (at: number | null) => void;
  /** Called before a box is changed, so that the change can be undone. */
  readonly onRecord: () => void;
  readonly onBox: (at: number, box: Box) => void;
  readonly onRemove: (at: number) => void;
  readonly onUndo: () => void;
  readonly handleRef: RefObject<BoxesHandle | null>;
};

const percent = 100;
/** How far an arrow key moves a box, as a share of the photo. */
const keyStep = 0.01;
/** Closer than this to the top of the photo, in pixels, a box's number stands inside it. */
const tagRoom = 40;
/** How many pixels of height make no difference to where the numbers stand. */
const coarse = 16;
const iconSize = 14;

const share = (value: number): string => `${value * percent}%`;

const cursors: Readonly<Record<Handle, string>> = {
  n: 'cursor-ns-resize',
  s: 'cursor-ns-resize',
  e: 'cursor-ew-resize',
  w: 'cursor-ew-resize',
  ne: 'cursor-nesw-resize',
  sw: 'cursor-nesw-resize',
  nw: 'cursor-nwse-resize',
  se: 'cursor-nwse-resize',
};

/** Where on the box each handle sits. */
const places: Readonly<Record<Handle, string>> = {
  nw: 'top-0 left-0',
  n: 'top-0 left-1/2',
  ne: 'top-0 left-full',
  e: 'top-1/2 left-full',
  se: 'top-full left-full',
  s: 'top-full left-1/2',
  sw: 'top-full left-0',
  w: 'top-1/2 left-0',
};

/** The sides of a box that isn't chosen: where it is taken hold of. */
const sides: ReadonlyArray<string> = [
  '-inset-x-2 -top-2 h-4 pointer-coarse:-top-4 pointer-coarse:h-8',
  '-inset-x-2 -bottom-2 h-4 pointer-coarse:-bottom-4 pointer-coarse:h-8',
  '-inset-y-2 -left-2 w-4 pointer-coarse:-left-4 pointer-coarse:w-8',
  '-inset-y-2 -right-2 w-4 pointer-coarse:-right-4 pointer-coarse:w-8',
];

/** The chosen box: its whole face moves it, its sides and corners pull it. */
const Chosen = ({
  at,
  holding,
}: {
  readonly at: number;
  readonly holding: Holding;
}) => (
  <>
    <span
      className="pointer-events-auto absolute inset-0 cursor-move touch-none outline outline-1 outline-lamp"
      {...holdOf(holding, at, 'whole')}
    />
    {handles.map((handle) => (
      <span
        className={`-translate-1/2 pointer-events-auto absolute size-2.5 touch-none border border-sheet bg-lamp before:absolute before:-inset-2 pointer-coarse:before:-inset-4 ${places[handle]} ${cursors[handle]}`}
        data-handle={handle}
        key={handle}
        {...holdOf(holding, at, handle)}
      />
    ))}
  </>
);

/** What a key asks of the box the keyboard is on, other than moving it. */
const commandOf = (
  event: KeyboardEvent,
  isChosen: boolean,
): 'remove' | 'undo' | 'let-go' | null => {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    return 'remove';
  }
  if (event.key === 'z' && (event.ctrlKey || event.metaKey)) {
    return 'undo';
  }
  return event.key === 'Escape' && isChosen ? 'let-go' : null;
};

/** The number of a box, which is what the keyboard reaches, and the way to remove it. */
const Tag = ({
  at,
  props,
  isInside,
  photoRef,
  howId,
}: {
  readonly at: number;
  readonly props: Props;
  /** The id of the words that say what the keys do. */
  readonly howId: string;
  /** Whether it stands inside the box, for want of room above it. */
  readonly isInside: boolean;
  readonly photoRef: RefObject<Rect | null>;
}) => {
  const { boxes, selected } = props;
  const isChosen = selected === at;
  const commands = {
    remove: () => props.onRemove(at),
    undo: props.onUndo,
    // Lets go of the box. The change stays as it is written.
    'let-go': () => props.onSelect(null),
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const box = boxes[at]?.box;
    if (box === undefined) {
      return;
    }
    const command = commandOf(event, isChosen);
    if (command !== null) {
      event.preventDefault();
      event.stopPropagation();
      commands[command]();
      if (command === 'let-go') {
        event.currentTarget.blur();
      }
      return;
    }
    const photo = photoRef.current;
    const next = nudged(box, event.key, {
      isResizing: event.shiftKey,
      step: { x: keyStep, y: keyStep },
      least: {
        x: leastSide / Math.max(1, photo?.w ?? 1),
        y: leastSide / Math.max(1, photo?.h ?? 1),
      },
    });
    if (next !== null) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (next !== null && !isSameBox(next, box)) {
      props.onRecord();
      props.onBox(at, next);
    }
  };
  return (
    <span
      className={`pointer-events-auto absolute left-0 flex items-center gap-1 ${isInside ? 'top-1.5 left-1.5' : 'bottom-full mb-1.5'}`}
    >
      <button
        aria-describedby={howId}
        aria-label={`Box ${at + 1} of ${boxes.length}`}
        aria-pressed={isChosen}
        className={`type-edge tabular grid h-7 pointer-coarse:h-9 min-w-7 pointer-coarse:min-w-9 place-items-center px-1.5 ${isChosen ? 'bg-wax-yellow text-sheet' : 'bg-ground text-wax-yellow'} ${boxes.length > 1 || isChosen ? '' : 'opacity-0 focus-visible:opacity-100'}`}
        data-box-tag={at}
        onClick={() => props.onSelect(at)}
        onFocus={() => props.onSelect(at)}
        onKeyDown={onKeyDown}
        type="button"
      >
        {at + 1}
      </button>
      {isChosen ? (
        <button
          aria-label={`Remove box ${at + 1}`}
          className="grid pointer-coarse:size-9 size-7 place-items-center bg-ground text-lamp hover:bg-wax-red hover:text-sheet"
          onClick={() => props.onRemove(at)}
          title="Remove this box (Delete)"
          type="button"
        >
          <X aria-hidden="true" size={iconSize} />
        </button>
      ) : null}
    </span>
  );
};

export const Boxes = (props: Props) => {
  const { boxes, selected, initial, handleRef } = props;
  const howId = useId();
  const allRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<Rect | null>(initial);
  /** How tall the photo is, roughly: enough to know where the numbers have room. */
  const [tall, setTall] = useState(() =>
    Math.round((initial?.h ?? 0) / coarse),
  );
  const holding = useGrab(props, photoRef);

  const put = (photo: Rect) => {
    const all = allRef.current;
    if (all !== null) {
      all.style.transform = `translate3d(${photo.x}px, ${photo.y}px, 0)`;
      all.style.width = `${photo.w}px`;
      all.style.height = `${photo.h}px`;
    }
  };
  // A press anywhere else lets go of the box that is chosen.
  const letGo = useEffectEvent((event: globalThis.PointerEvent) => {
    const isOnBox =
      event.target instanceof Element &&
      event.target.closest('[data-boxes]') !== null;
    if (!isOnBox && selected !== null) {
      props.onSelect(null);
    }
  });
  useEffect(() => {
    globalThis.addEventListener('pointerdown', letGo, true);
    return () => globalThis.removeEventListener('pointerdown', letGo, true);
  }, []);
  useImperativeHandle(handleRef, () => ({
    follow: (photo) => {
      photoRef.current = photo;
      put(photo);
      setTall(Math.round(photo.h / coarse));
    },
  }));

  return (
    <div
      className="pointer-events-none absolute top-0 left-0"
      data-boxes=""
      ref={(all) => {
        allRef.current = all;
        if (photoRef.current !== null) {
          put(photoRef.current);
        }
      }}
    >
      <p className="sr-only" id={howId}>
        The arrow keys move it. Shift with the arrow keys changes its size.
        Delete removes it.
      </p>
      {boxes.map(({ box }, at) => {
        const isChosen = selected === at;
        return (
          <div
            className={isChosen ? 'absolute z-10' : 'absolute'}
            data-box={at}
            data-chosen={isChosen}
            // biome-ignore lint/suspicious/noArrayIndexKey: a box has nothing of its own but its place in the row
            key={at}
            // biome-ignore lint/nursery/noInlineStyles: a box lies where it was drawn on the photo, which no class can know
            style={{
              left: share(box.left),
              top: share(box.top),
              width: share(box.right - box.left),
              height: share(box.bottom - box.top),
            }}
          >
            {isChosen ? (
              <Chosen at={at} holding={holding} />
            ) : (
              sides.map((side) => (
                <span
                  className={`pointer-events-auto absolute cursor-move touch-none ${side}`}
                  key={side}
                  {...holdOf(holding, at, 'whole')}
                />
              ))
            )}
            <Tag
              at={at}
              howId={howId}
              isInside={box.top * tall * coarse < tagRoom}
              photoRef={photoRef}
              props={props}
            />
          </div>
        );
      })}
    </div>
  );
};
