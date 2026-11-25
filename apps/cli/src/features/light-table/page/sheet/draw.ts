import { pictureWidths } from '../../contract.ts';
import { widthFor } from '../data/pictures.ts';
import { clamp, mix } from '../motion/spring.ts';
import type { Atlas } from './atlas.ts';
import { boxStride, type Painter, pictureStride } from './gl.ts';
import type { Loader } from './loader.ts';
import { inSight, type Placed, type Table } from './table.ts';
import type { Tiles, TileWanted } from './tiles.ts';

// Draws the table with WebGL: the sheets of paper, then every frame in
// sight, from the atlas and, where it is shown large, from its own texture.

export type Scene = {
  readonly painter: Painter;
  readonly atlas: Atlas;
  readonly loader: Loader;
  readonly tiles: Tiles;
  /** Device pixels for each pixel of the layout. */
  scale: number;
  /** The greys of the table lit, the table dark, and the paper, from 0 to 1. */
  readonly greys: {
    readonly table: number;
    readonly dark: number;
    readonly paper: number;
  };
};

/**
 * How bright a frame is that isn't lit, against one that is. Small frames
 * are darker, so that the album stands out of the whole shoot; large ones
 * are brighter, so that what they show can be judged.
 */
const deepShade = 0.34;
const lightShade = 0.62;
const shadeFrom = 36;
const shadeUpTo = 220;

const shadeAt = (frame: number): number =>
  mix(
    deepShade,
    lightShade,
    clamp((frame - shadeFrom) / (shadeUpTo - shadeFrom), 0, 1),
  );
/** How much of the table is left to see while one photo is looked at. */
const dimmest = 0.022;
/** How long a picture takes to appear, in milliseconds. */
const appearing = 420;
const sharpening = 180;
/** From how much stretching on a frame gets a texture of its own. */
const stretchLimit = 1.25;
const [, , , largestOnTable] = pictureWidths;
const shadowBlur = 9;
const shadowDrop = 3;
const shadowStrength = 0.45;

type Row = {
  readonly placed: Placed;
  readonly y: number;
  readonly alpha: number;
};

const makeRows = (stride: number) => {
  let data = new Float32Array(stride);
  let count = 0;
  return {
    reset: () => {
      count = 0;
    },
    push: (values: ReadonlyArray<number>) => {
      if ((count + 1) * stride > data.length) {
        const larger = new Float32Array(data.length * 2);
        larger.set(data);
        data = larger;
      }
      data.set(values, count * stride);
      count += 1;
      return count - 1;
    },
    data: () => data,
    count: () => count,
  };
};

type Rows = ReturnType<typeof makeRows>;

/** The sheets of paper, each with the shadow it throws on the table. */
const pushPaper = (boxes: Rows, table: Table, grey: number, glow: number) => {
  const scroll = table.scroller.value;
  for (const { x, y, w, h, alpha } of table.papers.values()) {
    const dark = shadowStrength * alpha.value * glow;
    const top = y.value - scroll + shadowDrop;
    boxes.push([x.value, top, w.value, h.value, 0, 0, 0, dark, shadowBlur]);
  }
  for (const { x, y, w, h, alpha } of table.papers.values()) {
    const seen = alpha.value * glow;
    const shade = grey * seen;
    const top = y.value - scroll;
    boxes.push([x.value, top, w.value, h.value, shade, shade, shade, seen, 0]);
  }
};

/**
 * The frames whose pictures have nothing to show yet, or only begin to:
 * each as the one colour its picture is nearest to, so that the whole shoot
 * lies there at once.
 */
const pushWaiting = (
  { loader }: Scene,
  boxes: Rows,
  table: Table,
  look: { readonly now: number; readonly glow: number; readonly shade: number },
) => {
  const scroll = table.scroller.value;
  for (const { frame, x, y, w, h, alpha, light } of inSight(table)) {
    const since = loader.shownSince(frame.picture.src);
    if (since === undefined || look.now - since < appearing) {
      const seen = alpha.value * look.glow;
      const lit = mix(look.shade, 1, light.value) * seen;
      const [red, green, blue] = loader.colourOf(frame.picture);
      const top = y.value - scroll;
      const colour = [red * lit, green * lit, blue * lit, seen];
      boxes.push([x.value, top, w.value, h.value, ...colour, 0]);
    }
  }
};

export const makeDrawing = (scene: Scene) => {
  const boxes = makeRows(boxStride);
  const pictures = makeRows(pictureStride);

  /** The frames in sight, with how much of each is to be seen. */
  const rowsOf = (
    table: Table,
    now: number,
    glow: number,
    hidden: string | null,
  ): ReadonlyArray<Row> => {
    const scroll = table.scroller.value;
    const rows: Array<Row> = [];
    for (const placed of inSight(table)) {
      const since = scene.loader.shownSince(placed.frame.picture.src);
      if (since !== undefined && placed.frame.id !== hidden) {
        const appeared = clamp((now - since) / appearing, 0, 1);
        rows.push({
          placed,
          y: placed.y.value - scroll,
          alpha: placed.alpha.value * appeared * glow,
        });
      }
    }
    return rows;
  };

  const drawFromAtlas = (rows: ReadonlyArray<Row>) => {
    const { atlas } = scene;
    const byTexture = new Map<WebGLTexture, Array<Row>>();
    for (const row of rows) {
      const { src, width, height } = row.placed.frame.picture;
      const { texture } = atlas.spotOf(src, width / height);
      const same = byTexture.get(texture);
      if (same === undefined) {
        byTexture.set(texture, [row]);
      } else {
        same.push(row);
      }
    }
    pictures.reset();
    const ranges: Array<readonly [WebGLTexture, number, number]> = [];
    for (const [texture, same] of byTexture) {
      const first = pictures.count();
      for (const { placed, y, alpha } of same) {
        const { src, width, height } = placed.frame.picture;
        const { uv } = atlas.spotOf(src, width / height);
        const rect = [placed.x.value, y, placed.w.value, placed.h.value];
        pictures.push([...rect, ...uv, placed.light.value, alpha]);
      }
      ranges.push([texture, first, same.length]);
    }
    return ranges;
  };

  /** Adds the frames that have a texture of their own, and asks for more. */
  const drawFromTiles = (rows: ReadonlyArray<Row>, now: number) => {
    const { tiles, atlas, scale } = scene;
    const wanted: Array<TileWanted> = [];
    const ranges: Array<readonly [WebGLTexture, number, number]> = [];
    for (const { placed, y, alpha } of rows) {
      const { picture } = placed.frame;
      const pixels = Math.max(placed.w.value, placed.h.value) * scale;
      if (pixels > atlas.cell * stretchLimit) {
        const width = widthFor(picture, placed.w.value * scale);
        wanted.push({
          key: picture.src,
          picture,
          width: width ?? largestOnTable,
        });
        const tile = tiles.get(picture.src, now);
        if (tile !== undefined) {
          const sharp = clamp((now - tile.since) / sharpening, 0, 1);
          const rect = [placed.x.value, y, placed.w.value, placed.h.value];
          const look = [placed.light.value, alpha * sharp];
          const first = pictures.push([...rect, 0, 0, 1, 1, ...look]);
          ranges.push([tile.texture, first, 1]);
        }
      }
    }
    tiles.want(wanted);
    return ranges;
  };

  return {
    /** Draws one frame of the table. Says whether pictures still appear. */
    draw: (table: Table, now: number, hidden: string | null): boolean => {
      const { painter, greys } = scene;
      const lights = table.lights.value;
      const glow = mix(dimmest, 1, lights);
      scene.atlas.finish();
      const shade = shadeAt(table.frame.value);
      painter.clear(mix(greys.dark, greys.table, lights));
      boxes.reset();
      pushPaper(boxes, table, greys.paper, glow);
      pushWaiting(scene, boxes, table, { now, glow, shade });
      painter.loadBoxes(boxes.data(), boxes.count());
      painter.drawBoxes(0, boxes.count());
      const rows = rowsOf(table, now, glow, hidden);
      const isTaking = scene.tiles.takeOne(now);
      const fromAtlas = drawFromAtlas(rows);
      const fromTiles = drawFromTiles(rows, now);
      painter.loadPictures(pictures.data(), pictures.count(), shade);
      for (const [texture, first, count] of [...fromAtlas, ...fromTiles]) {
        painter.drawPictures(texture, first, count);
      }
      const isAppearing = rows.some(({ placed }) => {
        const since = scene.loader.shownSince(placed.frame.picture.src) ?? now;
        return now - since < appearing;
      });
      return isAppearing || isTaking;
    },
  };
};

export type Drawing = ReturnType<typeof makeDrawing>;
