import { type RefObject, useRef, useState } from 'react';
import type { Box, PhotoView, Picture } from '../../contract.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { counterpartOf } from '../data/derive.ts';
import { standingOf } from '../data/words.ts';
import { isChosen } from '../marks/act.ts';
import { chrome } from '../ui/classes.ts';
import { type Keys, useKeys } from '../ui/keys.ts';
import { useHeight } from '../ui/use-height.ts';
import { Below, Whole } from './below.tsx';
import { type BesideHandle, Pair } from './beside.tsx';
import { Compare, type Version } from './compare.tsx';
import { Info } from './info.tsx';
import { insetOf, isWide, type Rooms, roomsOf, type Seen } from './room.ts';
import { Stage } from './stage.tsx';
import { Strip } from './strip.tsx';
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
import { wordOf } from './word.ts';

// One photo, looked at: the picture itself, what is known about it beside
// it, and the owner's pencils below.

const wordHeight = 64;
const percent = 100;
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
};

/** What the keys do: nothing on the way back, less while writing, more from close. */
const useBodyKeys = (around: Around, doing: Doing) => {
  const { photo, shown, composing, marking, hasAnswer, isClose } = doing;
  const isComposing = composing.draft !== null;
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
    shown: photo.edit === null ? null : shown,
    marking,
    hasAnswer,
    onLabel: doing.onLabel,
  });
  // From close, Escape first leads back to the whole photo.
  const whole: Keys = [['Escape', () => around.stageRef.current?.toggleZoom()]];
  // While a change is written no letter marks the photo, wherever the keyboard is.
  const awake = isComposing
    ? whileComposing
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
        <p className="type-label truncate px-2 text-print">
          {standingOf(index, photo).text}
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

/** The photo of the album that this one is measured against, if it has one. */
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

export const Body = ({
  photo,
  around,
}: {
  readonly photo: PhotoView;
  readonly around: Around;
}) => {
  const { index, state } = useShootContext();
  const { size, isInfoShown, stageRef } = around;
  const shown = useVersion(photo);
  const composing = useComposing(photo);
  const marking = useMarking(photo, around, { shown, composing });
  const [printed, setPrinted] = useState<Box | null>(null);
  const [isClose, setIsClose] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);
  const besideRef = useRef<BesideHandle | null>(null);
  const shareRef = useRef<HTMLSpanElement>(null);
  const foot = useHeight<HTMLElement>(0);
  useNeighbours(around);

  const isWorkedOn = state.activity?.photos.includes(photo.id) ?? false;
  const isComposing = composing.draft !== null;
  const word = wordOf(index, photo, { isWorkedOn, isComposing });
  const other = isChosen(photo) ? null : counterpartOf(index, photo);
  const rooms = roomsOf(
    size,
    {
      isInfoShown,
      isComposing,
      extra: word === null ? 0 : wordHeight,
      measured: foot.height,
    },
    other !== null,
  );
  const ink = useInk({ index, photo, draft: composing.draft, printed });
  // The words of a change stay where they are written, on a ground.
  const isAside = isClose && !isComposing;
  const isOnPhoto = isClose && isComposing;
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
  });
  const onSeen = (seen: Seen) => {
    besideRef.current?.follow(seen);
    if (shareRef.current !== null) {
      shareRef.current.textContent = `${Math.round(seen.share * percent)} %`;
    }
  };

  return (
    <>
      <Stage
        clip={isClose && other !== null ? insetOf(rooms.wide, size) : null}
        finished={finishedOf(photo, shown.version)}
        from={around.from}
        handleRef={stageRef}
        ink={ink}
        isDrawing={isComposing}
        look={lookOf(shown.version, shown.isWiping)}
        onClose={setIsClose}
        onSeen={onSeen}
        photo={photo}
        room={rooms.mine}
        side={around.side}
        wanted={{
          onSwipe: around.onTurn,
          onDismiss: around.onClose,
          onPull: around.onPull,
          onBox: composing.addBox,
        }}
        wide={rooms.wide}
      />
      <Other
        around={around}
        handleRef={besideRef}
        isClose={isClose}
        other={other}
        photo={photo}
        rooms={rooms}
      />
      <Above
        around={around}
        isAside={isAside}
        isOnPhoto={isOnPhoto}
        photo={photo}
        shown={shown}
      />
      <Whole
        isShown={isAside}
        onWhole={() => stageRef.current?.toggleZoom()}
        shareRef={shareRef}
      />
      <aside
        aria-label="About this photo"
        className={`${chrome} absolute z-20 overflow-y-auto overscroll-contain bg-dark`}
        data-about=""
        data-shown={isInfoShown}
        data-wide={isWide(size)}
        inert={!isInfoShown}
      >
        <Info labelRef={labelRef} onPrinted={setPrinted} photo={photo} />
      </aside>
      <Below
        doing={{ shown, composing, marking }}
        footRef={foot.ref}
        isAside={isAside}
        isOnPhoto={isOnPhoto}
        photo={photo}
        word={word}
      />
    </>
  );
};
