import { clamp } from '../../../shared/boxes.ts';
import type { Person } from '../../../shared/domain.ts';
import type { Frame, Raster, Size } from '../../../shared/pictures.ts';
import { type Fit, guidedFilter } from './guided.ts';
import { lightChange, relit } from './light.ts';
import { matteOf } from './matte.ts';
import { grown, personMask } from './outline.ts';
import {
  brightest,
  channels,
  indexOf,
  lightAt,
  mapPlanes,
  type Plane,
  type Planes,
  type Reader,
  readerAt,
  shrunkLight,
  srgbOf,
} from './raster.ts';
import { averaging } from './smooth.ts';

// Everything is measured in a small view in which the face is this wide, so a
// large and a small face are treated alike.
const faceWidth = 40;
/** How much of the frame around the person is looked at, in face widths. */
const margin = 0.6;

/** What is replaced, from how much of a pixel is the person. */
const slightly = 0.4;
/** How far beyond that, so nothing is left of the edit's person. */
const reach = { grow: 1, edge: 1 };
/** How closely the full-size picture's edges are followed. */
const edgeRadius = 1;
const edgeCalm = 0.0005;
/** How much an edge is sharpened, so that grain near it doesn't count. */
const crisp = 4;
const half = 0.5;
/** What pixels near the edge count where there are no others. */
const doubtful = 0.03;

const frameAround = ({ face, outline }: Person, picture: Size): Frame => {
  const extra = (face.right - face.left) * picture.width * margin;
  const xs = [face.left, face.right, ...outline.map(({ x }) => x)].map(
    (x) => x * picture.width,
  );
  const ys = [face.top, face.bottom, ...outline.map(({ y }) => y)].map(
    (y) => y * picture.height,
  );
  const left = Math.floor(clamp(Math.min(...xs) - extra, 0, picture.width - 1));
  const top = Math.floor(clamp(Math.min(...ys) - extra, 0, picture.height - 1));
  const right = Math.ceil(
    clamp(Math.max(...xs) + extra, left + 1, picture.width),
  );
  const bottom = Math.ceil(
    clamp(Math.max(...ys) + extra, top + 1, picture.height),
  );
  return { left, top, width: right - left, height: bottom - top };
};

type View = {
  readonly frame: Frame;
  readonly size: Size;
  /** How much of each pixel is replaced. */
  readonly replaced: Plane;
  /** How much of each pixel is the person whatever its colour. */
  readonly inside: Plane;
  /** How much of each pixel is the person, from its colour. */
  readonly person: Fit;
  readonly personLight: Planes;
  readonly backgroundLight: Planes;
};

const viewOf = (original: Raster, edit: Raster, person: Person): View => {
  const frame = frameAround(person, original);
  const facePixels = (person.face.right - person.face.left) * original.width;
  const scale = Math.max(1, facePixels / faceWidth);
  const size = {
    width: Math.max(1, Math.round(frame.width / scale)),
    height: Math.max(1, Math.round(frame.height / scale)),
  };
  const before = shrunkLight(original, frame, size);
  const after = shrunkLight(edit, frame, size);
  const mask = personMask(person, original, frame, size);
  const colours = mapPlanes(before, (plane) => plane.map(srgbOf));
  const { matte, inside, outside } = matteOf(colours, mask, size);
  // The edit's person may reach a little further than the original's.
  const inEdit = matteOf(
    mapPlanes(after, (plane) => plane.map(srgbOf)),
    mask,
    size,
  ).matte;
  const everywhere = new Float32Array(mask.length).fill(1);
  return {
    frame,
    size,
    replaced: grown(
      matte.map((part, index) =>
        Math.max(part, inEdit[index] ?? 0) > slightly ? 1 : 0,
      ),
      size,
      reach,
    ),
    inside,
    person: guidedFilter(
      colours,
      averaging(everywhere, size, edgeRadius),
      edgeCalm,
    )(matte),
    personLight: lightChange(
      before,
      after,
      inside.map((part, index) => part + (matte[index] ?? 0) * doubtful),
      size,
    ),
    backgroundLight: lightChange(
      before,
      after,
      outside.map((part, index) => part + (1 - (matte[index] ?? 0)) * doubtful),
      size,
    ),
  };
};

/** How much of a pixel of the original is the person. */
const personPart = (
  { person, inside }: View,
  read: Reader,
  pixel: ReadonlyArray<number>,
): number => {
  let part = read(person.offset);
  for (const channel of channels) {
    part += read(person.slopes[channel]) * ((pixel[channel] ?? 0) / brightest);
  }
  return Math.max(clamp((part - half) * crisp + half, 0, 1), read(inside));
};

/**
 * Puts a person from the original photo into an edit of it, in the light the
 * edit gave them: every pixel is the original's, made brighter, darker, warmer
 * or cooler over areas too large to change a feature. Changes `edit`.
 */
export const keepPerson = (
  original: Raster,
  edit: Raster,
  person: Person,
): void => {
  const view = viewOf(original, edit, person);
  const { frame, size } = view;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const read = readerAt(frame, size, { x, y });
      const replaced = read(view.replaced);
      if (replaced > 0) {
        const index = indexOf(original, frame.left + x, frame.top + y);
        const pixel = channels.map(
          (channel) => original.pixels[index + channel] ?? 0,
        );
        const part = personPart(view, read, pixel);
        for (const channel of channels) {
          const change =
            part * read(view.personLight[channel]) +
            (1 - part) * read(view.backgroundLight[channel]);
          const light = relit(lightAt(pixel[channel] ?? 0), change);
          edit.pixels[index + channel] = Math.round(
            replaced * srgbOf(light) * brightest +
              (1 - replaced) * (edit.pixels[index + channel] ?? 0),
          );
        }
      }
    }
  }
};
