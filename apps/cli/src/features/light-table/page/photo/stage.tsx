import {
  type RefObject,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { PhotoView, Picture } from '../../contract.ts';
import { blurOf } from '../data/pictures.ts';
import type { Rect } from '../sheet/layout.ts';
import { apply, type Live, scaleOf } from './apply.ts';
import {
  type Control,
  type Entry,
  makeControl,
  type Wanted,
} from './control.ts';
import { Divider } from './divider.tsx';
import { listenToGestures } from './gestures.ts';
import type { Ink } from './ink.ts';
import { Layer } from './layers.tsx';
import { type Motion, makeMotion } from './motion.ts';
import { cover, onScreen, type Plane, planeOf, type View } from './plane.ts';
import type { Seen } from './room.ts';
import {
  isCloser,
  type Look,
  partOf,
  restOf,
  type Setting,
} from './setting.ts';
import { useClip } from './use-clip.ts';
import { useCamera, usePicture } from './use-picture.ts';

// A photo that is looked at: the plane with the camera's picture and the
// finished photo, moved by springs and by the fingers.

/** A frame of the table, and whether it shows the camera's picture or the finished photo. */
export type FrameOnTable = {
  readonly rect: Rect;
  readonly shows: 'camera' | 'edit';
};

/** A picture as it is on the screen at one moment. */
export type Still = { readonly src: string; readonly rect: Rect };

export type StageHandle = {
  /**
   * Lets the photo travel back to a frame of the table, which is asked for
   * every frame, since the table may move meanwhile. Nothing stops it then.
   */
  readonly leave: (to: () => FrameOnTable | null, then: () => void) => void;
  readonly toggleZoom: () => void;
  /** The photo as it is seen this instant, for when another takes its place. */
  readonly still: () => Still | null;
};

type Props = {
  readonly photo: PhotoView;
  /** Where on the screen the photo rests. */
  readonly room: Rect;
  /** What it may cover when it is looked at from close. */
  readonly wide: Rect;
  /** What is cut away around it, as the sides of an inset, or nothing. */
  readonly clip: string | null;
  readonly look: Look;
  /** The finished photo to show: the one of now, or an earlier one. */
  readonly finished: Picture | null;
  /** The frame of the table the photo comes from, when it was opened there. */
  readonly from: FrameOnTable | null;
  /** How it comes in from the side when the page is turned to it. */
  readonly entry: Entry | null;
  readonly ink: Omit<Ink, 'draft'>;
  readonly isDrawing: boolean;
  readonly isWriting: boolean;
  readonly wanted: Omit<Wanted, 'onDraft' | 'onWipe'>;
  readonly handleRef: RefObject<StageHandle | null>;
  /** Called when the photo comes close, and when it shows whole again. */
  readonly onClose: (isClose: boolean) => void;
  /** Called every frame the photo moves in. */
  readonly onSeen: ((seen: Seen) => void) | null;
  /** Called every frame with how far the whole photo is off to the side. */
  readonly onOffset: (offset: number) => void;
};

const viewOnto = (plane: Plane, frame: FrameOnTable): View =>
  cover(
    frame.shows === 'camera' ? plane.camera : (plane.edit ?? plane.camera),
    frame.rect,
  );

const cameraShown = (setting: Setting): number =>
  setting.look === 'edit' && setting.plane.edit !== null ? 0 : 1;

/** The scale at which one pixel of the sharpest picture is one of the screen. */
const fullOf = ({ edit, full }: PhotoView, plane: Plane): number => {
  if (plane.edit !== null && edit !== null) {
    return edit.picture.width / scaleOf() / plane.edit.w;
  }
  return full.width / scaleOf() / plane.camera.w;
};

type Refs = {
  readonly stageRef: RefObject<HTMLDivElement | null>;
  readonly planeRef: RefObject<HTMLDivElement | null>;
  readonly cameraRef: RefObject<HTMLDivElement | null>;
  readonly inkRef: RefObject<HTMLCanvasElement | null>;
  readonly dividerRef: RefObject<HTMLDivElement | null>;
  readonly rangeRef: RefObject<HTMLInputElement | null>;
};

/** Starts the springs and the gestures for as long as the stage is there. */
const useMachine = (refs: Refs, live: Live, wanted: Props['wanted']) => {
  const [machine, setMachine] = useState<Machine | null>(null);
  const onSwipe = useEffectEvent(wanted.onSwipe);
  const onDismiss = useEffectEvent(wanted.onDismiss);
  const onPull = useEffectEvent(wanted.onPull);
  const onBox = useEffectEvent(wanted.onBox);

  // Before the first frame is shown, so that none shows the photo unplaced.
  useLayoutEffect(() => {
    const stage = refs.stageRef.current;
    const plane = refs.planeRef.current;
    const camera = refs.cameraRef.current;
    const ink = refs.inkRef.current;
    const divider = refs.dividerRef.current;
    const range = refs.rangeRef.current;
    if (
      stage === null ||
      plane === null ||
      camera === null ||
      ink === null ||
      divider === null ||
      range === null
    ) {
      return;
    }
    const elements = { plane, camera, ink, divider, range };
    const motion = makeMotion((view, shown, now) => {
      const part = live.setting.plane.edit ?? live.setting.plane.camera;
      live.onPixels(part.w * motion.target().s * scaleOf());
      if (live.hasArrived) {
        live.onSeen(view, isCloser(live.setting, motion.target()));
        plane.style.visibility = 'visible';
      }
      if (apply(elements, live, { view, shown, now })) {
        motion.request();
      }
    });
    const control = makeControl(motion, live.setting, {
      onSwipe,
      onDismiss,
      onPull,
      onBox,
      onDraft: (draft) => {
        live.ink = { ...live.ink, draft };
        motion.request();
      },
      onWipe: (share) => {
        live.setting.wipe = share;
        motion.request();
      },
    });
    const stop = listenToGestures(stage, control.gestures);
    const resize = () => {
      const scale = scaleOf();
      ink.width = Math.round(stage.clientWidth * scale);
      ink.height = Math.round(stage.clientHeight * scale);
      motion.request();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    setMachine({ motion, control });
    return () => {
      stop();
      observer.disconnect();
      motion.stop();
      setMachine(null);
    };
  }, [
    refs.stageRef,
    refs.planeRef,
    refs.cameraRef,
    refs.inkRef,
    refs.dividerRef,
    refs.rangeRef,
    live,
  ]);

  return machine;
};

type Machine = { readonly motion: Motion; readonly control: Control };

/** Brings a photo onto the stage: out of its frame, from the side, or in place. */
const arrive = (
  { motion, control }: Machine,
  setting: Setting,
  how: {
    readonly from: FrameOnTable | null;
    readonly entry: Entry | null;
  },
) => {
  const { from, entry } = how;
  const camera = from?.shows === 'camera' ? 1 : cameraShown(setting);
  const isPlain = from === null && entry === null;
  motion.show({ camera, all: isPlain ? 0 : 1 }, true);
  motion.show({ all: 1 });
  control.enter(from === null ? null : viewOnto(setting.plane, from), entry);
};

/** Keeps the springs up to date with what is to be shown. */
const useFollowing = (
  machine: ReturnType<typeof useMachine>,
  live: Live,
  props: Props,
) => {
  const {
    photo,
    room,
    wide,
    look,
    from,
    entry,
    ink,
    isDrawing,
    isWriting,
    handleRef,
  } = props;
  const shownRef = useRef<string | null>(null);
  // On its way back to the table nothing may call the photo back, such as
  // an answer of the server that arrives meanwhile.
  const isLeavingRef = useRef(false);

  // How it comes in is the same for as long as this photo is shown.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `from` and `entry` are read once, when the photo arrives
  useLayoutEffect(() => {
    if (machine === null || isLeavingRef.current) {
      return;
    }
    const { setting } = live;
    const isNew = shownRef.current !== photo.id;
    shownRef.current = photo.id;
    // Asked before the room changes: a smaller room doesn't make it close.
    const wasClose = !isNew && machine.control.zoom.isZoomed();
    setting.plane = planeOf(photo);
    setting.room = room;
    setting.wide = wide;
    setting.look = look;
    setting.full = fullOf(photo, setting.plane);
    live.hasArrived = true;
    if (isNew) {
      arrive(machine, setting, { from, entry });
    } else {
      machine.control.rest(false, wasClose);
    }
    machine.motion.show({ camera: cameraShown(setting) });
  }, [machine, live, photo, room, wide, look]);

  useEffect(() => {
    live.ink = { ...ink, draft: live.ink.draft };
    live.setting.isDrawing = isDrawing;
    live.setting.isWriting = isWriting;
    machine?.motion.request();
  }, [machine, live, ink, isDrawing, isWriting]);

  useImperativeHandle(handleRef, () => ({
    leave: (to, then) => {
      if (machine === null) {
        then();
        return;
      }
      isLeavingRef.current = true;
      const first = to();
      if (first !== null) {
        machine.motion.show({ camera: first.shows === 'camera' ? 1 : 0 });
      }
      machine.control.leave(() => {
        const frame = to();
        return frame === null ? null : viewOnto(live.setting.plane, frame);
      }, then);
    },
    still: () => {
      if (machine === null) {
        return null;
      }
      const { plane, look: shown } = live.setting;
      const view = machine.motion.view();
      const showsEdit = shown === 'edit' && plane.edit !== null;
      const src = showsEdit ? live.srcs.edit : live.srcs.camera;
      const part = showsEdit ? (plane.edit ?? plane.camera) : plane.camera;
      return src === null ? null : { src, rect: onScreen(part, view) };
    },
    toggleZoom: () => {
      const { room: now } = live.setting;
      machine?.control.zoom.toggle({
        x: now.x + now.w / 2,
        y: now.y + now.h / 2,
      });
    },
  }));
};

const firstPixels = 1280;

export const Stage = (props: Props) => {
  const { photo, room, wide, look, finished, clip } = props;
  const stageRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const [pixels, setPixels] = useState(firstPixels);
  const [live] = useState<Live>(() => ({
    setting: {
      plane: planeOf(photo),
      room,
      wide,
      look,
      full: 1,
      isDrawing: false,
      isWriting: false,
      wipe: 0.5,
    },
    ink: { ...props.ink, draft: null },
    onPixels: () => undefined,
    hasArrived: false,
    isClose: false,
    onSeen: () => undefined,
    srcs: { camera: null, edit: null },
  }));
  live.onPixels = (wanted) => {
    // Asked for in steps, so that a spring on its way doesn't ask every frame.
    const step = 2 ** Math.ceil(Math.log2(Math.max(1, wanted)));
    if (step !== pixels) {
      setPixels(step);
    }
  };
  live.onSeen = (view, isClose) => {
    const { setting } = live;
    if (isClose !== live.isClose) {
      live.isClose = isClose;
      props.onClose(isClose);
    }
    const rest = restOf(setting);
    props.onSeen?.({
      now: onScreen(partOf(setting), view),
      rest: onScreen(partOf(setting), rest),
      edit: onScreen(setting.plane.edit ?? setting.plane.camera, view),
      share: view.s / setting.full,
    });
    // Only a photo that is seen whole is ever off to the side as a whole, and
    // not one that flies from its frame on the table or back to it.
    const isAside = !isClose && machine?.control.isAside() === true;
    props.onOffset(isAside ? view.x - rest.x : 0);
  };
  const machine = useMachine(
    { stageRef, planeRef, cameraRef, inkRef, dividerRef, rangeRef },
    live,
    props.wanted,
  );
  useFollowing(machine, live, props);
  useClip(stageRef, clip);

  const plane = planeOf(photo);
  const camera = useCamera(photo, look, pixels);
  const finishedSrc = usePicture(finished, pixels);
  live.srcs = { camera: camera.src, edit: finishedSrc };

  return (
    <div
      className="absolute inset-0 touch-none select-none overflow-hidden"
      data-drawing={props.isDrawing}
      ref={stageRef}
    >
      <div
        className="invisible absolute top-0 left-0 origin-top-left will-change-transform"
        ref={planeRef}
      >
        {plane.edit === null || finished === null ? null : (
          <Layer blur={blurOf(finished)} rect={plane.edit} src={finishedSrc} />
        )}
        <Layer
          blur={blurOf(photo.picture)}
          file={camera.file}
          layerRef={cameraRef}
          rect={plane.camera}
          src={camera.src}
        />
      </div>
      <canvas
        className="pointer-events-none absolute inset-0 size-full"
        ref={inkRef}
      />
      <Divider
        dividerRef={dividerRef}
        onWipe={(share) => {
          live.setting.wipe = share;
          machine?.motion.request();
        }}
        rangeRef={rangeRef}
      />
    </div>
  );
};
