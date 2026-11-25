import type { Rect } from '../sheet/layout.ts';

// Where everything is while a photo is looked at: the photo gets all the
// window that the strip above it, the pencils below and the notes beside it
// leave.

export const stripHeight = 52;
export const barHeight = 76;
/** The pencils make room for the words of a change. */
export const composerHeight = 116;
/** The line that says where a photo stands, and why. */
export const standingHeight = 48;
/** The strip of the photos that show the same. */
export const stackHeight = 74;
/** What an agent answered, or what the owner said, above the pencils. */
export const wordHeight = 64;
export const infoWidth = 352;
/** From this width on the notes stand beside the photo instead of over it. */
export const wideFrom = 980;
/** The room a line of print takes below each of two photos. */
export const captionHeight = 26;
const widePad = 20;
const narrowPad = 6;
const besideGap = 14;

export type Chrome = {
  readonly isInfoShown: boolean;
  readonly isComposing: boolean;
  /** Room for what stands above the pencils: words, the pile, where it stands. */
  readonly extra: number;
  /** How high what lies below the photo really is, once that is known. */
  readonly measured: number;
};

type Size = { readonly width: number; readonly height: number };

export const isWide = ({ width }: Size): boolean => width >= wideFrom;

/** The part of the window a photo may fill. */
export const roomOf = (size: Size, chrome: Chrome): Rect => {
  const beside = isWide(size) && chrome.isInfoShown ? infoWidth : 0;
  const pad = isWide(size) ? widePad : narrowPad;
  // What is said to be there holds while the page is turned, so that a
  // photo doesn't settle twice; words that grow longer push the photo up.
  const below = Math.max(
    (chrome.isComposing ? composerHeight : barHeight) + chrome.extra,
    chrome.measured,
  );
  return {
    x: pad,
    y: stripHeight,
    w: Math.max(1, size.width - beside - pad * 2),
    h: Math.max(1, size.height - stripHeight - below - pad),
  };
};

/**
 * All a photo may cover when it is looked at from close: the whole window,
 * but for the notes beside it.
 */
export const wideOf = (size: Size, isInfoShown: boolean): Rect => ({
  x: 0,
  y: 0,
  w: size.width - (isWide(size) && isInfoShown ? infoWidth : 0),
  h: size.height,
});

/** Two rooms in one, for a photo and the one it is compared with. */
export const halves = (room: Rect): readonly [Rect, Rect] => {
  if (room.w >= room.h) {
    const w = (room.w - besideGap) / 2;
    return [
      { ...room, w },
      { ...room, x: room.x + w + besideGap, w },
    ];
  }
  const h = (room.h - besideGap) / 2;
  return [
    { ...room, h },
    { ...room, y: room.y + h + besideGap, h },
  ];
};

export type Rooms = {
  readonly mine: Rect;
  /** The room of the photo it is compared with, when there is one. */
  readonly theirs: Rect | null;
  /** What each may cover when it is looked at from close. */
  readonly wide: Rect;
  readonly wideTheirs: Rect | null;
};

/** The room of a photo, or of two that are compared, each with a line of print. */
export const roomsOf = (
  size: Size,
  chrome: Chrome,
  hasOther: boolean,
): Rooms => {
  const room = roomOf(size, chrome);
  const wide = wideOf(size, chrome.isInfoShown);
  if (!hasOther) {
    return { mine: room, theirs: null, wide, wideTheirs: null };
  }
  const [mine, theirs] = halves(room);
  const [wideMine, wideTheirs] = halves(wide);
  return {
    mine: { ...mine, h: mine.h - captionHeight },
    theirs: { ...theirs, h: theirs.h - captionHeight },
    wide: wideMine,
    wideTheirs,
  };
};

/** The largest rectangle of a shape that fits a room, in its middle. */
export const fitIn = (room: Rect, aspect: number): Rect => {
  const w = Math.min(room.w, room.h * aspect);
  const h = w / aspect;
  return { x: room.x + (room.w - w) / 2, y: room.y + (room.h - h) / 2, w, h };
};

/** How far a photo has to be zoomed in before the one beside it follows all the way. */
const followsBy = 0.03;

/** A photo as it is seen this instant. */
export type Seen = {
  /** Where the part looked at is on the screen, and where it rests. */
  readonly now: Rect;
  readonly rest: Rect;
  /** Where the finished photo is, which the boxes of a change are drawn on. */
  readonly edit: Rect;
  /** How large it is: at 1 a pixel of the picture is one of the screen. */
  readonly share: number;
};

/**
 * Where the photo beside one lies while that one is looked at from close: on
 * the same spot of the picture, and as much larger, so that what both show
 * stays as large in one as in the other.
 */
export const mirrored = (
  { now, rest }: Pick<Seen, 'now' | 'rest'>,
  theirs: Rect,
): Rect => {
  const closer = Math.max(1, now.w / rest.w);
  const follows = Math.min(1, (closer - 1) / followsBy);
  const w = theirs.w * closer;
  const h = theirs.h * closer;
  // How far the middle of the picture has moved, in pictures.
  const across = (now.x + now.w / 2 - (rest.x + rest.w / 2)) / now.w;
  const down = (now.y + now.h / 2 - (rest.y + rest.h / 2)) / now.h;
  return {
    x: theirs.x + theirs.w / 2 + across * w * follows - w / 2,
    y: theirs.y + theirs.h / 2 + down * h * follows - h / 2,
    w,
    h,
  };
};

/** How much of a window lies outside a part of it, as the sides of an inset. */
export const insetOf = (part: Rect, { width, height }: Size): string =>
  [part.y, width - part.x - part.w, height - part.y - part.h, part.x]
    .map((side) => `${Math.max(0, side)}px`)
    .join(' ');
