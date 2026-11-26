import { clamp } from '../motion/spring.ts';
import type { Rect } from '../sheet/layout.ts';
import type { Shown } from './gliding.ts';
import { drawInk, type Ink, type Travel } from './ink.ts';
import { onScreen, type View } from './plane.ts';
import { dividerOn, restOf, type Setting } from './setting.ts';

// Puts a photo that is looked at where its springs say it is: the plane with
// the pictures, the divider between before and after, and what is drawn.

export type Elements = {
  readonly plane: HTMLElement;
  readonly camera: HTMLElement;
  readonly ink: HTMLCanvasElement;
  readonly divider: HTMLElement;
  /** The divider for the keyboard. */
  readonly range: HTMLInputElement;
};

export type Live = {
  readonly setting: Setting;
  ink: Ink;
  /**
   * The frame of the table the photo came out of or goes back to: where it
   * is on the screen, and the part of the plane it shows.
   */
  frame: { readonly rect: Rect; readonly part: Rect } | null;
  /** The widest the finished photo has been asked to be, in device pixels. */
  onPixels: (pixels: number) => void;
  /** Whether the photo has been put where it belongs, which it isn't at first. */
  hasArrived: boolean;
  /** Whether the photo is looked at from close, as far as was said. */
  isClose: boolean;
  /** Where the photo is, told every frame, and whether it goes close. */
  onSeen: (view: View, isClose: boolean) => void;
  /** The pictures that are shown right now. */
  srcs: { camera: string | null; edit: string | null };
};

const mostScale = 3;
export const wipeSteps = 100;
export const scaleOf = (): number =>
  Math.min(globalThis.devicePixelRatio, mostScale);

/** Shows the camera's picture left of the divider, and only where the finished photo is. */
const wipe = (elements: Elements, setting: Setting, view: View) => {
  const { camera, divider, range } = elements;
  const isWiping = setting.look === 'wipe';
  range.value = String(Math.round(setting.wipe * wipeSteps));
  divider.style.visibility = isWiping ? 'visible' : 'hidden';
  if (!isWiping) {
    camera.style.clipPath = '';
    return;
  }
  const whole = setting.plane.camera;
  const part = setting.plane.edit ?? whole;
  const cut = {
    top: part.y - whole.y,
    right: whole.x + whole.w - (part.x + part.w * setting.wipe),
    bottom: whole.y + whole.h - (part.y + part.h),
    left: part.x - whole.x,
  };
  const sides = [cut.top, cut.right, cut.bottom, cut.left]
    .map((side) => `${Math.max(0, side)}px`)
    .join(' ');
  camera.style.clipPath = `inset(${sides})`;
  const seen = onScreen(part, view);
  divider.style.transform = `translate3d(${dividerOn(setting, view)}px, ${seen.y}px, 0)`;
  divider.style.height = `${seen.h}px`;
};

/** How far the photo is on its way from its frame of the table to where it rests. */
const travelOf = ({ frame, setting }: Live, view: View): Travel | null => {
  if (frame === null) {
    return null;
  }
  const atFrame = frame.rect.w / frame.part.w;
  const atRest = restOf(setting).s;
  const share =
    atRest === atFrame
      ? 1
      : clamp((view.s - atFrame) / (atRest - atFrame), 0, 1);
  return { part: frame.part, share };
};

/** Puts everything where the springs say it is. Says whether ink is still drawn. */
export const apply = (
  elements: Elements,
  live: Live,
  moved: { readonly view: View; readonly shown: Shown; readonly now: number },
): boolean => {
  const { view, shown, now } = moved;
  const { setting } = live;
  const { plane, camera, ink } = elements;
  plane.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.s})`;
  plane.style.opacity = String(shown.all);
  camera.style.opacity = String(shown.camera);
  wipe(elements, setting, view);
  const pencil = ink.getContext('2d');
  const scale = scaleOf();
  const size = {
    width: ink.width / scale,
    height: ink.height / scale,
    scale,
  };
  // The crop is printed on the camera's whole picture, not on a half of it.
  const printed = setting.look === 'wipe' ? { ...shown, camera: 0 } : shown;
  return pencil === null
    ? false
    : drawInk(
        pencil,
        {
          ink: live.ink,
          plane: setting.plane,
          view,
          shown: printed,
          now,
          travel: travelOf(live, view),
        },
        size,
      );
};
