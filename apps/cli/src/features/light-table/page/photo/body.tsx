import {
  type ReactNode,
  type RefObject,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { Box, PhotoView, Picture } from '../../contract.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { clockOf, dayAndMonth, dayOf, frameNumber } from '../data/format.ts';
import { chrome } from '../ui/classes.ts';
import { type Keys, useKeys } from '../ui/keys.ts';
import { useHeight } from '../ui/use-height.ts';
import { Below, Whole } from './below.tsx';
import { type BesideHandle, Pair } from './beside.tsx';
import { Boxes } from './boxes.tsx';
import { Compare, type Version } from './compare.tsx';
import { Info } from './info.tsx';
import { Neighbours } from './neighbours.tsx';
import { insetOf, isWide, type Rooms } from './room.ts';
import {
  type FrameOnTable,
  Stage,
  type StageHandle,
  type Still,
} from './stage.tsx';
import { Strip } from './strip.tsx';
import { Unseen } from './unseen.tsx';
import { useFollowing } from './use-following.ts';
import { useInk } from './use-ink.ts';
import {
  type Around,
  type Composing,
  keysOf,
  type Marking,
  type Showing,
  useComposing,
  useMarking,
  useNeighbours,
  useVersion,
} from './use-photo.ts';
import { useRooms } from './use-rooms.ts';
import { useSaidHeights } from './use-said-heights.ts';

// One photo, looked at: the picture itself, what is known about it beside
// it, and the owner's pencils below.

export type BodyHandle = {
  /** Lets the photo travel back to its frame of the table. Nothing stops it then. */
  readonly leave: (to: () => FrameOnTable | null, then: () => void) => void;
  /** The pictures as they are on the screen, for when another photo takes over. */
  readonly stills: () => ReadonlyArray<Still>;
};

const noKeys: Keys = [];

const lookOf = (version: Version, isWiping: boolean) => {
  if (isWiping) {
    return 'wipe';
  }
  return version === 'camera' ? 'before' : 'edit';
};

const finishedOf = (photo: PhotoView, version: Version): Picture | null => {
  if (photo.edit === null) {
    return null;
  }
  const earlier =
    typeof version === 'number' ? photo.edit.earlier[version - 1] : undefined;
  return earlier?.picture ?? photo.edit.picture;
};

type Doing = {
  readonly photo: PhotoView;
  readonly shown: Showing;
  readonly composing: Composing;
  readonly marking: Marking;
  readonly hasAnswer: boolean;
  /** Whether the photo is looked at from close. */
  readonly isClose: boolean;
  readonly onLabel: () => void;
  readonly onWhole: () => void;
};

/** What the keys do: nothing on the way back, less while writing, more from close. */
const useBodyKeys = (around: Around, doing: Doing) => {
  const { photo, shown, composing, marking, hasAnswer, isClose } = doing;
  const isComposing = composing.draft !== null;
  const chosen = composing.selected;
  const removeChosen =
    chosen === null ? undefined : () => composing.removeBox(chosen);
  const whileComposing: Keys = [
    [
      'Escape',
      () => {
        if (isComposing) {
          composing.cancel();
        } else if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      },
    ],
  ];
  const looking = keysOf(around, {
    photo,
    shown: photo.edit === null ? null : shown,
    marking,
    hasAnswer,
    onLabel: doing.onLabel,
    onZoom: doing.onWhole,
  });
  // From close, Escape first leads back to the whole photo.
  const whole: Keys = [['Escape', doing.onWhole]];
  // While a change is written no letter marks the photo, wherever the keyboard is.
  const onBoxes: Keys = [
    ['ctrl+z', composing.undoBox],
    ['Delete', removeChosen],
    ['Backspace', removeChosen],
  ];
  const awake = isComposing
    ? [...whileComposing, ...onBoxes]
    : [...(isClose ? whole : noKeys), ...looking];
  // On its way back to the table the photo leaves the keys to the table.
  useKeys(
    around.isLeaving ? noKeys : awake,
    around.isLeaving ? noKeys : whileComposing,
  );
};

/** The strip above the photo, with the pictures there are of it. */
const Above = ({
  photo,
  around,
  shown,
  isAside,
  isOnPhoto,
}: {
  readonly photo: PhotoView;
  readonly around: Around;
  readonly shown: Showing;
  readonly isAside: boolean;
  readonly isOnPhoto: boolean;
}) => {
  const { index } = useShootContext();
  const { order, at, isInfoShown } = around;
  return (
    <Strip
      hasAfter={at < order.length - 1}
      hasBefore={at > 0}
      isAside={isAside}
      isInfoShown={isInfoShown}
      isOnPhoto={isOnPhoto}
      onClose={around.onClose}
      onInfo={() => around.onInfo(!isInfoShown)}
      onTurn={around.onTurn}
      place={at < 0 ? '' : around.place}
    >
      {photo.edit === null ? (
        <p className="type-edge tabular truncate px-2 text-quiet">
          <span className="mr-2.5 text-print">
            {frameNumber(index.numberOf.get(photo.id) ?? 0)}
          </span>
          {dayAndMonth(dayOf(photo.takenAt))}, {clockOf(photo.takenAt)}
        </p>
      ) : (
        <Compare
          edit={photo.edit}
          isWiping={shown.isWiping}
          onVersion={shown.setVersion}
          onWipe={shown.setIsWiping}
          version={shown.version}
        />
      )}
    </Strip>
  );
};

/** The photo in front of this one, which it is measured against, if there is one. */
const Other = ({
  photo,
  other,
  rooms,
  around,
  isClose,
  handleRef,
}: {
  readonly photo: PhotoView;
  readonly other: PhotoView | null;
  readonly rooms: Rooms;
  readonly around: Around;
  readonly isClose: boolean;
  readonly handleRef: RefObject<BesideHandle | null>;
}) => {
  const { theirs, wideTheirs } = rooms;
  return other === null || theirs === null || wideTheirs === null ? null : (
    <Pair
      clip={insetOf(wideTheirs, around.size)}
      handleRef={handleRef}
      isClose={isClose}
      other={other}
      photo={photo}
      rooms={{ ...rooms, theirs, wideTheirs }}
    />
  );
};

/** The boxes of the change that is being written, to be taken hold of. */
const Drawn = ({
  composing,
  following,
}: {
  readonly composing: Composing;
  readonly following: ReturnType<typeof useFollowing>;
}) =>
  composing.draft === null || !composing.canDraw ? null : (
    <Boxes
      boxes={composing.draft.boxes}
      handleRef={following.boxesRef}
      initial={following.seenRef.current?.edit ?? null}
      onBox={composing.setBox}
      onRecord={composing.record}
      onRemove={composing.removeBox}
      onSelect={composing.select}
      onUndo={composing.undoBox}
      selected={composing.selected}
    />
  );

/** What is known about the photo: beside it, or over it on a small screen. */
const About = ({
  isShown,
  isWide: wide,
  children,
}: {
  readonly isShown: boolean;
  readonly isWide: boolean;
  readonly children: ReactNode;
}) => (
  <aside
    aria-label="About this photo"
    className={`${chrome} absolute z-20 overflow-y-auto overscroll-contain bg-dark`}
    data-about=""
    data-shown={isShown}
    data-wide={wide}
    inert={!isShown}
  >
    {children}
  </aside>
);

/** What the photo view asks of the photo it shows. */
const useBodyHandle = (
  handleRef: RefObject<BodyHandle | null>,
  stageRef: RefObject<StageHandle | null>,
  besideRef: RefObject<BesideHandle | null>,
) =>
  useImperativeHandle(handleRef, () => ({
    leave: (to, then) => {
      const stage = stageRef.current;
      if (stage === null) {
        then();
      } else {
        stage.leave(to, then);
      }
    },
    stills: () =>
      [stageRef.current?.still(), besideRef.current?.still()].filter(
        (still) => still !== null && still !== undefined,
      ),
  }));

export const Body = ({
  photo,
  around,
  handleRef,
}: {
  readonly photo: PhotoView;
  readonly around: Around;
  readonly handleRef: RefObject<BodyHandle | null>;
}) => {
  const { index } = useShootContext();
  const { size, isInfoShown, order, at } = around;
  const shown = useVersion(photo);
  const composing = useComposing(photo);
  const marking = useMarking(photo, around, { shown, composing });
  const [printed, setPrinted] = useState<Box | null>(null);
  const [isClose, setIsClose] = useState(false);
  const stageRef = useRef<StageHandle | null>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const following = useFollowing(around);
  const foot = useHeight<HTMLElement>(0);
  const said = useSaidHeights();
  useNeighbours(around, photo.id);

  const isComposing = composing.draft !== null;
  const { word, wordFor, other, rooms, roomBeside } = useRooms(photo, around, {
    isComposing,
    measured: foot.height,
    saidHeights: said.heights,
  });
  const ink = useInk({ index, photo, draft: composing.draft, printed });
  const isAside = isClose && !isComposing;
  const toggleZoom = () => stageRef.current?.toggleZoom();
  useBodyKeys(around, {
    photo,
    shown,
    composing,
    marking,
    hasAnswer: word?.kind === 'answer',
    isClose,
    onLabel: () => {
      around.onInfo(true);
      requestAnimationFrame(() => labelRef.current?.focus());
    },
    onWhole: toggleZoom,
  });
  useBodyHandle(handleRef, stageRef, following.besideRef);

  return (
    <>
      <Neighbours
        after={order[at + 1]}
        before={order[at - 1]}
        distance={size.width}
        handleRef={following.neighboursRef}
        roomOf={roomBeside}
      />
      <Stage
        clip={isClose && other !== null ? insetOf(rooms.wide, size) : null}
        entry={around.entry}
        finished={finishedOf(photo, shown.version)}
        from={around.from}
        handleRef={stageRef}
        ink={ink}
        isDrawing={composing.canDraw}
        look={lookOf(shown.version, shown.isWiping)}
        onClose={setIsClose}
        onOffset={following.onOffset}
        onSeen={following.onSeen}
        photo={photo}
        room={rooms.mine}
        wanted={{
          onSwipe: around.onTurn,
          onDismiss: around.onClose,
          onPull: around.onPull,
          onBox: composing.addBox,
        }}
        wide={rooms.wide}
      />
      <Drawn composing={composing} following={following} />
      <Other
        around={around}
        handleRef={following.besideRef}
        isClose={isClose}
        other={other}
        photo={photo}
        rooms={rooms}
      />
      <Above
        around={around}
        isAside={isAside}
        isOnPhoto={isClose && isComposing}
        photo={photo}
        shown={shown}
      />
      <Whole
        isShown={isAside}
        onWhole={toggleZoom}
        shareRef={following.shareRef}
      />
      <About isShown={isInfoShown} isWide={isWide(size)}>
        <Info
          isOver={!isWide(size)}
          labelRef={labelRef}
          onPrinted={setPrinted}
          photo={photo}
        />
      </About>
      <Below
        doing={{ shown, composing, marking }}
        footRef={foot.ref}
        isAside={isAside}
        isOnPhoto={isClose && isComposing}
        onShow={around.onShow}
        photo={photo}
        pile={around.pile}
        word={word}
      />
      <Unseen
        photos={[photo, order[at - 1], order[at + 1]]}
        unseenRef={said.ref}
        wordFor={wordFor}
      />
    </>
  );
};
