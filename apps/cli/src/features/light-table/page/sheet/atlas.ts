// Small copies of all pictures in a few large textures, so that a thousand
// frames are drawn in a handful of calls.

const pageSide = 2048;
/** The smallest copy of a cell that is still drawn, in pixels. */
const smallestCopy = 4;

export type Spot = {
  readonly texture: WebGLTexture;
  /** Left, top, right and bottom in the texture. */
  readonly uv: readonly [number, number, number, number];
};

type Size = { readonly width: number; readonly height: number };

/** The size of a picture inside a square cell. */
export const sizeIn = (cell: number, aspect: number): Size =>
  aspect >= 1
    ? { width: cell, height: Math.max(1, Math.round(cell / aspect)) }
    : { width: Math.max(1, Math.round(cell * aspect)), height: cell };

/** A texture of many cells, with smaller copies of itself for small frames. */
const makePage = (gl: WebGL2RenderingContext, cell: number): WebGLTexture => {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(
    gl.TEXTURE_2D,
    Math.log2(pageSide) + 1,
    gl.RGBA8,
    pageSide,
    pageSide,
  );
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // Smaller copies than this would mix neighbouring cells.
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MAX_LEVEL,
    Math.log2(cell / smallestCopy),
  );
  return texture;
};

export const makeAtlas = (gl: WebGL2RenderingContext, cell: number) => {
  const perSide = pageSide / cell;
  const perPage = perSide * perSide;
  const pages: Array<WebGLTexture> = [];
  const stale = new Set<number>();
  const slots = new Map<string, number>();
  const spare: Array<number> = [];
  let used = 0;
  const scratch = new OffscreenCanvas(cell, cell);
  const drawing = scratch.getContext('2d', { willReadFrequently: false });

  const pageOf = (index: number): WebGLTexture => {
    const known = pages[index];
    if (known !== undefined) {
      return known;
    }
    const texture = makePage(gl, cell);
    pages[index] = texture;
    return texture;
  };

  const slotOf = (key: string): number => {
    const known = slots.get(key);
    if (known !== undefined) {
      return known;
    }
    const slot = spare.pop() ?? used;
    used += slot === used ? 1 : 0;
    slots.set(key, slot);
    return slot;
  };

  const cornerOf = (slot: number) => {
    const inPage = slot % perPage;
    return {
      page: Math.floor(slot / perPage),
      x: (inPage % perSide) * cell,
      y: Math.floor(inPage / perSide) * cell,
    };
  };

  return {
    cell,
    /** Where the copy of a picture is, whether it is drawn yet or not. */
    spotOf: (key: string, aspect: number): Spot => {
      const { page, x, y } = cornerOf(slotOf(key));
      const { width, height } = sizeIn(cell, aspect);
      const half = 0.5;
      return {
        texture: pageOf(page),
        uv: [
          (x + half) / pageSide,
          (y + half) / pageSide,
          (x + width - half) / pageSide,
          (y + height - half) / pageSide,
        ],
      };
    },
    /** Draws a picture into its cell. */
    put: (key: string, aspect: number, picture: CanvasImageSource) => {
      if (drawing === null) {
        return;
      }
      const { page, x, y } = cornerOf(slotOf(key));
      const { width, height } = sizeIn(cell, aspect);
      drawing.imageSmoothingQuality = 'high';
      // Stretched over the whole cell first, so that the smaller copies of
      // the picture's edge don't mix with nothing.
      drawing.drawImage(picture, 0, 0, cell, cell);
      drawing.drawImage(picture, 0, 0, width, height);
      gl.bindTexture(gl.TEXTURE_2D, pageOf(page));
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        x,
        y,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        scratch,
      );
      stale.add(page);
    },
    /** Makes the smaller copies of what changed, once per frame at most. */
    finish: () => {
      for (const page of stale) {
        gl.bindTexture(gl.TEXTURE_2D, pageOf(page));
        gl.generateMipmap(gl.TEXTURE_2D);
      }
      stale.clear();
    },
    /** Gives up the cells of pictures that are no longer shown. */
    keepOnly: (keys: ReadonlySet<string>) => {
      for (const [key, slot] of slots) {
        if (!keys.has(key)) {
          slots.delete(key);
          spare.push(slot);
        }
      }
    },
  };
};

export type Atlas = ReturnType<typeof makeAtlas>;
