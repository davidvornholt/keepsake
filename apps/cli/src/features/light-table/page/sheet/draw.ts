import { pictureWidths } from '../../contract.ts';
import { widthFor } from '../data/pictures.ts';
import { clamp, mix } from '../motion/spring.ts';
import type { Atlas } from './atlas.ts';
import { boxStride, type Painter, pictureStride } from './gl.ts';
import type { Layout } from './layout.ts';
import type { Loader } from './loader.ts';
import { pileIn } from './pile.ts';
import {
  ghostInSight,
  inSight,
  type Seen,
  type Table,
  throughView,
  type View,
} from './table.ts';
import type { Tiles, TileWanted } from './tiles.ts';

// Draws the table with WebGL: the sheets of paper, then every frame in
// sight, from the atlas and, where it is shown large, from its own texture.
// While the frames change size, the layout that gives way is drawn first
// and the one that comes in over it, as a whole.

export type Scene = {
  readonly painter: Painter;
  readonly atlas: Atlas;
  readonly loader: Loader;
  readonly tiles: Tiles;
  /** Device pixels for each pixel of the layout. */
  scale: number;
  /** The greys of the table lit, the table dark, the paper, and what lies raised on it. */
  readonly greys: {
    readonly table: number;
    readonly dark: number;
    readonly paper: number;
    readonly raised: number;
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
/** How bright the edges of the photos behind the front one are, the furthest first. */
const farEdge = 0.3;
const nearEdge = 0.5;
const edgeShades = [farEdge, nearEdge] as const;
/** The dark line between two photos of a pile, in pixels. */
const rim = 1;
/** How far the tray under an open pile reaches around its frames, at least. */
const leastTray = 3;

/** One layout as it is seen: its frames and sheets. */
type Layer = {
  readonly seen: ReadonlyArray<Seen>;
  readonly layout: Layout;
  readonly view: View;
  /** How much of it shows, from 0 to 1. */
  readonly share: number;
  /** Whether its sheets are where the springs have them, or where it says. */
  readonly isNow: boolean;
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
type Range = readonly [WebGLTexture, number, number];

/** The sheets of a layer, each with the shadow it throws on the table. */
const pushPaper = (
  boxes: Rows,
  table: Table,
  { layout, view, isNow }: Layer,
  look: { readonly grey: number; readonly glow: number },
) => {
  const sheets = isNow
    ? [...table.papers.values()].map((paper) => ({
        rect: throughView(view, {
          x: paper.x.value,
          y: paper.y.value,
          w: paper.w.value,
          h: paper.h.value,
        }),
        seen: paper.alpha.value * look.glow,
      }))
    : layout.sheets.map(({ paper }) => ({
        rect: throughView(view, paper),
        seen: look.glow,
      }));
  for (const { rect, seen } of sheets) {
    const dark = shadowStrength * seen;
    const top = rect.y + shadowDrop;
    boxes.push([rect.x, top, rect.w, rect.h, 0, 0, 0, dark, shadowBlur]);
  }
  for (const { rect, seen } of sheets) {
    const shade = look.grey * seen;
    boxes.push([rect.x, rect.y, rect.w, rect.h, shade, shade, shade, seen, 0]);
  }
};

type Look = {
  readonly now: number;
  readonly glow: number;
  readonly shade: number;
};

/** What lies under the pictures of a layer: trays, the edges of piles, and what waits. */
const pushUnder = (
  { loader, greys }: Scene,
  boxes: Rows,
  { seen, layout, view }: Layer,
  look: Look,
) => {
  const around = Math.max(leastTray, layout.measure.gap) * view.k;
  for (const { placed, x, y, w, h } of seen) {
    if (placed.frame.opened !== null) {
      const there = placed.alpha.value * look.glow;
      const grey = greys.raised * there;
      boxes.push([
        x - around,
        y - around,
        w + around * 2,
        h + around * 2,
        grey,
        grey,
        grey,
        there,
        0,
      ]);
    }
  }
  for (const { placed, ...rect } of seen) {
    const { frame } = placed;
    const there = placed.alpha.value * look.glow;
    const lit = mix(look.shade, 1, placed.light.value) * there;
    const [red, green, blue] = loader.colourOf(frame.picture);
    const pile = pileIn(rect, frame.pile, layout.measure);
    const dark = greys.paper * there;
    for (const [at, edge] of pile.edges.entries()) {
      const dim =
        (edgeShades[at + edgeShades.length - pile.edges.length] ?? 1) * lit;
      boxes.push([
        edge.x - rim,
        edge.y - rim,
        edge.w + rim * 2,
        edge.h + rim * 2,
        dark,
        dark,
        dark,
        there,
        0,
      ]);
      boxes.push([
        edge.x,
        edge.y,
        edge.w,
        edge.h,
        red * dim,
        green * dim,
        blue * dim,
        there,
        0,
      ]);
    }
    const { face } = pile;
    if (pile.edges.length > 0) {
      boxes.push([
        face.x - rim,
        face.y - rim,
        face.w + rim * 2,
        face.h + rim * 2,
        dark,
        dark,
        dark,
        there,
        0,
      ]);
    }
    const since = loader.shownSince(frame.picture.src);
    if (since === undefined || look.now - since < appearing) {
      const colour = [red * lit, green * lit, blue * lit, there];
      boxes.push([face.x, face.y, face.w, face.h, ...colour, 0]);
    }
  }
};

/** What one drawing of the table goes by. */
type Shown = {
  readonly look: Look;
  /** The frame that is shown large right now, and so not here. */
  readonly hidden: string | null;
  /** The frames that need a texture of their own, noted while drawing. */
  readonly wanted: Array<TileWanted>;
};

/** The pictures of a layer from the atlas, texture by texture. */
const pushFromAtlas = (
  { atlas, loader }: Scene,
  pictures: Rows,
  { seen, layout }: Layer,
  { look, hidden }: Shown,
): Array<Range> => {
  const byTexture = new Map<WebGLTexture, Array<ReadonlyArray<number>>>();
  for (const { placed, ...rect } of seen) {
    const { frame } = placed;
    const { src, width, height } = frame.picture;
    const since = loader.shownSince(src);
    if (since !== undefined && frame.id !== hidden) {
      const appeared = clamp((look.now - since) / appearing, 0, 1);
      const { texture, uv } = atlas.spotOf(src, width / height);
      const { face } = pileIn(rect, frame.pile, layout.measure);
      const row = [
        face.x,
        face.y,
        face.w,
        face.h,
        ...uv,
        placed.light.value,
        placed.alpha.value * appeared * look.glow,
      ];
      const same = byTexture.get(texture);
      if (same === undefined) {
        byTexture.set(texture, [row]);
      } else {
        same.push(row);
      }
    }
  }
  const ranges: Array<Range> = [];
  for (const [texture, rows] of byTexture) {
    const first = pictures.count();
    for (const row of rows) {
      pictures.push(row);
    }
    ranges.push([texture, first, rows.length]);
  }
  return ranges;
};

/** Adds the frames that have a texture of their own, and notes which need one. */
const pushFromTiles = (
  { tiles, atlas, scale }: Scene,
  pictures: Rows,
  { seen, layout }: Layer,
  { look, hidden, wanted }: Shown,
): Array<Range> => {
  const ranges: Array<Range> = [];
  for (const { placed, ...rect } of seen) {
    const { picture, id, pile } = placed.frame;
    const pixels = Math.max(rect.w, rect.h) * scale;
    if (pixels > atlas.cell * stretchLimit && id !== hidden) {
      const width = widthFor(picture, rect.w * scale);
      wanted.push({
        key: picture.src,
        picture,
        width: width ?? largestOnTable,
      });
      const tile = tiles.get(picture.src, look.now);
      if (tile !== undefined) {
        const sharp = clamp((look.now - tile.since) / sharpening, 0, 1);
        const { face } = pileIn(rect, pile, layout.measure);
        const first = pictures.push([
          face.x,
          face.y,
          face.w,
          face.h,
          0,
          0,
          1,
          1,
          placed.light.value,
          placed.alpha.value * sharp * look.glow,
        ]);
        ranges.push([tile.texture, first, 1]);
      }
    }
  }
  return ranges;
};

const layersOf = (table: Table): ReadonlyArray<Layer> => {
  const now = {
    seen: inSight(table),
    layout: table.layout,
    view: table.view,
    share: table.ghost === null ? 1 : table.fade,
    isNow: true,
  };
  return table.ghost === null
    ? [now]
    : [
        {
          seen: ghostInSight(table),
          layout: table.ghost.layout,
          view: table.ghost.view,
          share: 1,
          isNow: false,
        },
        now,
      ];
};

export const makeDrawing = (scene: Scene) => {
  const boxes = makeRows(boxStride);
  const pictures = makeRows(pictureStride);

  return {
    /** Draws one frame of the table. Says whether pictures still appear. */
    draw: (table: Table, now: number, hidden: string | null): boolean => {
      const { painter, greys, loader } = scene;
      const lights = table.lights.value;
      const glow = mix(dimmest, 1, lights);
      scene.atlas.finish();
      const look = { now, glow, shade: shadeAt(table.frame.value) };
      painter.clear(mix(greys.dark, greys.table, lights));
      const isTaking = scene.tiles.takeOne(now);
      const shown: Shown = { look, hidden, wanted: [] };
      boxes.reset();
      pictures.reset();
      const parts = layersOf(table).map((layer) => {
        const firstBox = boxes.count();
        pushPaper(boxes, table, layer, { grey: greys.paper, glow });
        pushUnder(scene, boxes, layer, look);
        return {
          share: layer.share,
          boxes: [firstBox, boxes.count() - firstBox] as const,
          ranges: [
            ...pushFromAtlas(scene, pictures, layer, shown),
            ...pushFromTiles(scene, pictures, layer, shown),
          ],
        };
      });
      // While the frames change size no sharper copies are asked for.
      if (table.zooming === null) {
        scene.tiles.want(shown.wanted);
      }
      for (const part of parts) {
        if (part.share < 1) {
          painter.apart.begin();
        }
        painter.loadBoxes(boxes.data(), boxes.count());
        painter.drawBoxes(...part.boxes);
        painter.loadPictures(pictures.data(), pictures.count(), look.shade);
        for (const [texture, first, count] of part.ranges) {
          painter.drawPictures(texture, first, count);
        }
        if (part.share < 1) {
          painter.apart.end(part.share);
        }
      }
      const isAppearing = inSight(table).some(({ placed }) => {
        const since = loader.shownSince(placed.frame.picture.src) ?? now;
        return now - since < appearing;
      });
      return isAppearing || isTaking;
    },
  };
};

export type Drawing = ReturnType<typeof makeDrawing>;
