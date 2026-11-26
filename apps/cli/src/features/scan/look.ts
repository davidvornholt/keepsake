// What a photo looks like, shrunk to a few pixels, and how alike two photos
// are: whether the same picture can be found in both, also when the camera
// moved a little between them or zoomed a little in or out.

/** How many pixels a look has on its long side. */
export const lookSide = 48;

export type Look = {
  readonly width: number;
  readonly height: number;
  /**
   * For each pixel, row by row: its brightness, how much redder than green it
   * is, and how much yellower than blue. Colour tells apart pictures that
   * are only alike in light and dark.
   */
  readonly channels: readonly [Float32Array, Float32Array, Float32Array];
};

/** Space, tab, line feed and carriage return, which part a PPM header. */
const spaces = new Set([' ', '\t', '\n', '\r'].map((one) => one.charCodeAt(0)));
const isSpace = (byte: number) => spaces.has(byte);

/** The numbers at the start of a PPM file, and where its pixels begin. */
const headerOf = (ppm: Uint8Array) => {
  const words: Array<string> = [];
  let at = 0;
  const fields = 4;
  while (words.length < fields && at < ppm.length) {
    while (at < ppm.length && isSpace(ppm[at] ?? 0)) {
      at += 1;
    }
    let word = '';
    while (at < ppm.length && !isSpace(ppm[at] ?? 0)) {
      word += String.fromCharCode(ppm[at] ?? 0);
      at += 1;
    }
    words.push(word);
  }
  const [kind, width, height, most] = words;
  return {
    isPpm: kind === 'P6' && most === '255',
    width: Number(width),
    height: Number(height),
    // A single space ends the header.
    start: at + 1,
  };
};

const byteRange = 255;
const red = 0.299;
const green = 0.587;
const blue = 0.114;
const colours = 3;

/** A look from the picture that `magick … -depth 8 ppm:-` writes, or null. */
export const lookOf = (ppm: Uint8Array): Look | null => {
  const { isPpm, width, height, start } = headerOf(ppm);
  const size = width * height;
  if (!isPpm || size === 0 || ppm.length < start + size * colours) {
    return null;
  }
  const light = new Float32Array(size);
  const redGreen = new Float32Array(size);
  const yellowBlue = new Float32Array(size);
  for (let index = 0; index < size; index += 1) {
    const at = start + index * colours;
    const r = (ppm[at] ?? 0) / byteRange;
    const g = (ppm[at + 1] ?? 0) / byteRange;
    const b = (ppm[at + 2] ?? 0) / byteRange;
    light[index] = red * r + green * g + blue * b;
    redGreen[index] = r - g;
    yellowBlue[index] = (r + g) / 2 - b;
  }
  return { width, height, channels: [light, redGreen, yellowBlue] };
};

/** Where the middle of a pixel lies, from its corner. */
const pixelMiddle = 0.5;

/** The look at another size, each pixel blended from the four nearest. */
const resized = (look: Look, width: number, height: number): Look => {
  const scaleX = look.width / width;
  const scaleY = look.height / height;
  const at = (x: number, y: number) =>
    Math.min(look.height - 1, Math.max(0, y)) * look.width +
    Math.min(look.width - 1, Math.max(0, x));
  const channels = look.channels.map((channel) => {
    const out = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      const fromY = (y + pixelMiddle) * scaleY - pixelMiddle;
      const top = Math.floor(fromY);
      const down = fromY - top;
      for (let x = 0; x < width; x += 1) {
        const fromX = (x + pixelMiddle) * scaleX - pixelMiddle;
        const left = Math.floor(fromX);
        const across = fromX - left;
        const upper =
          (channel[at(left, top)] ?? 0) * (1 - across) +
          (channel[at(left + 1, top)] ?? 0) * across;
        const lower =
          (channel[at(left, top + 1)] ?? 0) * (1 - across) +
          (channel[at(left + 1, top + 1)] ?? 0) * across;
        out[y * width + x] = upper * (1 - down) + lower * down;
      }
    }
    return out;
  });
  const [light = new Float32Array(), redGreen = light, yellowBlue = light] =
    channels;
  return { width, height, channels: [light, redGreen, yellowBlue] };
};

/** The look at half its size, each pixel the mean of four. */
const halved = (look: Look): Look =>
  resized(
    look,
    Math.max(1, Math.floor(look.width / 2)),
    Math.max(1, Math.floor(look.height / 2)),
  );

/** How much of the smaller picture two of them must share to be compared. */
const leastShared = 0.45;
/** Below this, a picture is too even to say what it shows. */
const leastSpread = 1e-6;

/**
 * How alike two looks are where `b` lies so many pixels right of and below
 * the top left corner of `a`, from -1 to 1, or null when they share too
 * little. Their means are taken out, so light that changed doesn't count.
 */
const likenessAt = (a: Look, b: Look, dx: number, dy: number) => {
  const left = Math.max(0, dx);
  const right = Math.min(a.width, dx + b.width);
  const top = Math.max(0, dy);
  const bottom = Math.min(a.height, dy + b.height);
  const count = Math.max(0, right - left) * Math.max(0, bottom - top);
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  if (count < leastShared * smaller) {
    return null;
  }
  let together = 0;
  let spreadA = 0;
  let spreadB = 0;
  for (let channel = 0; channel < colours; channel += 1) {
    const one = a.channels[channel] ?? new Float32Array();
    const other = b.channels[channel] ?? new Float32Array();
    let sumA = 0;
    let sumB = 0;
    let sumAA = 0;
    let sumBB = 0;
    let sumAB = 0;
    for (let y = top; y < bottom; y += 1) {
      const rowA = y * a.width;
      const rowB = (y - dy) * b.width - dx;
      for (let x = left; x < right; x += 1) {
        const valueA = one[rowA + x] ?? 0;
        const valueB = other[rowB + x] ?? 0;
        sumA += valueA;
        sumB += valueB;
        sumAA += valueA * valueA;
        sumBB += valueB * valueB;
        sumAB += valueA * valueB;
      }
    }
    together += sumAB - (sumA * sumB) / count;
    spreadA += sumAA - (sumA * sumA) / count;
    spreadB += sumBB - (sumB * sumB) / count;
  }
  const spread = Math.sqrt(Math.max(0, spreadA) * Math.max(0, spreadB));
  return spread < leastSpread ? null : together / spread;
};

type Place = { readonly dx: number; readonly dy: number; readonly at: number };

/** The places where `b` lies most like `a`, best first, among those given. */
const bestPlaces = (
  a: Look,
  b: Look,
  places: ReadonlyArray<{ readonly dx: number; readonly dy: number }>,
  kept: number,
): ReadonlyArray<Place> =>
  places
    .flatMap(({ dx, dy }) => {
      const at = likenessAt(a, b, dx, dy);
      return at === null ? [] : [{ dx, dy, at }];
    })
    .toSorted((one, other) => other.at - one.at)
    .slice(0, kept);

/** Every place `b` can lie on `a`. */
const everyPlace = (a: Look, b: Look) =>
  Array.from({ length: a.height + b.height - 1 }, (_, row) =>
    Array.from({ length: a.width + b.width - 1 }, (__, column) => ({
      dx: column - b.width + 1,
      dy: row - b.height + 1,
    })),
  ).flat();

/** How many of the best rough places are looked at closely. */
const roughKept = 3;
/** How far around a rough place, in pixels, the close look goes. */
const closeReach = 2;

/**
 * How alike two photos look, from -1 to 1: how alike they are where they
 * match best when one is moved over the other. `zoom` is how much closer `b`
 * was zoomed in than `a`, its focal length over that of `a`. The places are
 * found on looks of half the size first, then looked at closely.
 */
export const likeness = (a: Look, b: Look, zoom: number): number => {
  const scaled = resized(
    b,
    Math.max(1, Math.round(b.width / zoom)),
    Math.max(1, Math.round(b.height / zoom)),
  );
  const roughA = halved(a);
  const roughB = halved(scaled);
  const rough = bestPlaces(
    roughA,
    roughB,
    everyPlace(roughA, roughB),
    roughKept,
  );
  const close = rough.flatMap(({ dx, dy }) =>
    Array.from({ length: (closeReach * 2 + 1) ** 2 }, (_, index) => ({
      dx: dx * 2 + (index % (closeReach * 2 + 1)) - closeReach,
      dy: dy * 2 + Math.floor(index / (closeReach * 2 + 1)) - closeReach,
    })),
  );
  const [best] = bestPlaces(a, scaled, close, 1);
  return best?.at ?? -1;
};
