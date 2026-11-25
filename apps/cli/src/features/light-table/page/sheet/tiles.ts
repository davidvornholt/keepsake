import type { Picture, pictureWidths } from '../../contract.ts';
import { urlOf } from '../data/pictures.ts';
import { makeRetries } from '../data/retries.ts';

// Larger copies of the pictures in sight, one texture each, for frames that
// are shown larger than their cell in the atlas. The ones not drawn for the
// longest time make room for new ones.

type Width = (typeof pictureWidths)[number];

export type TileWanted = {
  readonly key: string;
  readonly picture: Picture;
  readonly width: Width;
};

type Tile = {
  readonly texture: WebGLTexture;
  readonly width: Width;
  readonly bytes: number;
  /** When it arrived, in milliseconds, so that it can fade in. */
  readonly since: number;
  usedAt: number;
};

const atOnce = 4;
const bytesPerPixel = 4;
/** A texture with its smaller copies takes a third more. */
const withSmallerCopies = 1.34;
const megabyte = 1_048_576;
/**
 * Taking a copy in can hold a frame up on a slow graphics card, so while the
 * table moves they come this many milliseconds apart.
 */
const apartWhileMoving = 300;

const textureOf = (
  gl: WebGL2RenderingContext,
  bitmap: ImageBitmap,
): WebGLTexture => {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
};

export const makeTiles = (
  gl: WebGL2RenderingContext,
  megabytes: number,
  onArrived: () => void,
) => {
  const tiles = new Map<string, Tile>();
  const loading = new Set<string>();
  /** Copies that arrived and wait for a frame of their own. */
  const arrived: Array<TileWanted & { readonly bitmap: ImageBitmap }> = [];
  const retries = makeRetries(onArrived);
  let wanted: ReadonlyArray<TileWanted> = [];
  let held = 0;
  let isMoving = false;
  let tookAt = 0;

  const makeRoom = () => {
    const inSight = new Set(wanted.map(({ key }) => key));
    const oldestFirst = [...tiles]
      .filter(([key]) => !inSight.has(key))
      .toSorted(([, left], [, right]) => left.usedAt - right.usedAt);
    for (const [key, tile] of oldestFirst) {
      if (held <= megabytes * megabyte) {
        return;
      }
      gl.deleteTexture(tile.texture);
      tiles.delete(key);
      held -= tile.bytes;
    }
  };

  const keep = (key: string, width: Width, bitmap: ImageBitmap) => {
    const texture = textureOf(gl, bitmap);
    const before = tiles.get(key);
    if (before !== undefined) {
      gl.deleteTexture(before.texture);
      held -= before.bytes;
    }
    const bytes =
      bitmap.width * bitmap.height * bytesPerPixel * withSmallerCopies;
    const now = performance.now();
    // A sharper copy of what is shown already doesn't fade in again.
    tiles.set(key, {
      texture,
      width,
      bytes,
      since: before?.since ?? now,
      usedAt: now,
    });
    held += bytes;
    makeRoom();
  };

  const fetchOne = async ({ key, picture, width }: TileWanted) => {
    const id = `${key}@${width}`;
    loading.add(id);
    try {
      const response = await fetch(urlOf(picture, width));
      // As the graphics card wants it, so that taking it in needs no pass over every pixel.
      const bitmap = await createImageBitmap(await response.blob(), {
        premultiplyAlpha: 'none',
      });
      // It counts as loading until a frame has taken it in.
      arrived.push({ key, picture, width, bitmap });
      retries.arrived(id);
    } catch {
      retries.failed(id);
      loading.delete(id);
      fetchMore();
    }
    onArrived();
  };

  const fetchMore = () => {
    const next =
      loading.size < atOnce
        ? wanted.find(
            ({ key, width }) =>
              (tiles.get(key)?.width ?? 0) < width &&
              !loading.has(`${key}@${width}`) &&
              !retries.isHeld(`${key}@${width}`),
          )
        : undefined;
    if (next !== undefined) {
      // It can't fail: a picture that doesn't arrive is asked for again.
      fetchOne(next).catch(() => undefined);
      fetchMore();
    }
  };

  return {
    /** The frames in sight that need more than the atlas has. */
    want: (list: ReadonlyArray<TileWanted>) => {
      wanted = list;
      fetchMore();
    },
    /**
     * Takes in one copy that arrived; more in one frame would make it long.
     * Says whether others wait.
     */
    takeOne: (now: number): boolean => {
      const isHeld = isMoving && now - tookAt < apartWhileMoving;
      const next = isHeld ? undefined : arrived.shift();
      if (next !== undefined) {
        tookAt = now;
        keep(next.key, next.width, next.bitmap);
        next.bitmap.close();
        loading.delete(`${next.key}@${next.width}`);
        fetchMore();
      }
      return arrived.length > 0;
    },
    /** Whether the table moves, which matters more than sharper pictures. */
    moves: (does: boolean) => {
      isMoving = does;
    },
    /** The larger copy of a picture, if it is there. */
    get: (key: string, now: number): Tile | undefined => {
      const tile = tiles.get(key);
      if (tile !== undefined) {
        tile.usedAt = now;
      }
      return tile;
    },
  };
};

export type Tiles = ReturnType<typeof makeTiles>;
