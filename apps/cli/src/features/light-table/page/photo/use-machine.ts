import {
  type RefObject,
  useEffectEvent,
  useLayoutEffect,
  useState,
} from 'react';
import { apply, type Live, scaleOf } from './apply.ts';
import { type Control, makeControl, type Wanted } from './control.ts';
import { listenToGestures } from './gestures.ts';
import { type Motion, makeMotion } from './motion.ts';
import { isCloser } from './setting.ts';

// The springs and the gestures of a photo that is looked at, which move it.

type Refs = {
  readonly stageRef: RefObject<HTMLDivElement | null>;
  readonly planeRef: RefObject<HTMLDivElement | null>;
  readonly cameraRef: RefObject<HTMLDivElement | null>;
  readonly inkRef: RefObject<HTMLCanvasElement | null>;
  readonly dividerRef: RefObject<HTMLDivElement | null>;
  readonly rangeRef: RefObject<HTMLInputElement | null>;
};

/** Starts the springs and the gestures for as long as the stage is there. */
export const useMachine = (
  refs: Refs,
  live: Live,
  wanted: Omit<Wanted, 'onDraft' | 'onWipe'>,
) => {
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

export type Machine = { readonly motion: Motion; readonly control: Control };
