// Pictures of made-up landscapes, so no test needs a photo of anyone's.
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import type { Box } from '../../src/shared/domain.ts';

type Color = readonly [red: number, green: number, blue: number];

type Light = {
  readonly zenith: Color;
  readonly horizon: Color;
  readonly land: Color;
};

const lights: ReadonlyArray<Light> = [
  { zenith: [58, 92, 148], horizon: [246, 190, 142], land: [52, 60, 84] },
  { zenith: [72, 138, 196], horizon: [206, 226, 234], land: [64, 92, 70] },
  { zenith: [46, 44, 92], horizon: [240, 128, 86], land: [40, 34, 56] },
  { zenith: [120, 148, 160], horizon: [222, 222, 212], land: [84, 96, 92] },
  { zenith: [24, 34, 70], horizon: [92, 106, 152], land: [18, 24, 42] },
  { zenith: [92, 160, 178], horizon: [250, 224, 178], land: [116, 92, 62] },
];

const whole: Box = { left: 0, top: 0, right: 1, bottom: 1 };
const channels = 3;

const mixed = (from: Color, to: Color, amount: number): Color => {
  const share = Math.min(1, Math.max(0, amount));
  return [
    from[0] + (to[0] - from[0]) * share,
    from[1] + (to[1] - from[1]) * share,
    from[2] + (to[2] - from[2]) * share,
  ];
};

/** The colour of a landscape at a point of it. */
const colorAt = (seed: number, x: number, y: number): Color => {
  const light = lights[seed % lights.length] ?? (lights[0] as Light);
  const sun = {
    x: 0.2 + ((seed * 0.37) % 0.6),
    y: 0.3 + ((seed * 0.13) % 0.2),
  };
  const near = Math.hypot(x - sun.x, (y - sun.y) * 0.66);
  const bright: Color = [255, 246, 224];
  const sky = mixed(light.zenith, light.horizon, y / 0.62);
  let color = mixed(sky, bright, near < 0.035 ? 0.95 : 0.35 - near);
  for (const layer of [0, 1, 2]) {
    const ridge =
      0.5 +
      layer * 0.13 +
      Math.sin(x * (5 + layer * 2) + seed * (1 + layer)) * 0.05 +
      Math.sin(x * (17 - layer * 3) + seed * 2.3) * 0.018;
    if (y > ridge) {
      color = mixed(light.horizon, light.land, 0.45 + layer * 0.27);
    }
  }
  return color;
};

const depth = 8;
const trueColor = 2;

const chunk = (name: string, data: Uint8Array) => {
  const bytes = Buffer.alloc(data.length + 12);
  bytes.writeUInt32BE(data.length, 0);
  bytes.write(name, 4, 'latin1');
  bytes.set(data, 8);
  bytes.writeUInt32BE(
    crc32(bytes.subarray(4, data.length + 8)),
    data.length + 8,
  );
  return bytes;
};

const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const headerStart = 16;
const firstData = 33;

export type Drawing = {
  /** Different numbers give different landscapes. */
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  /** The part of it to show. */
  readonly part?: Box;
  /** Whether its colours are as dull as a camera's or as strong as an edit's. */
  readonly look: 'camera' | 'edited';
};

/** A picture of a landscape, as a PNG. */
export const drawn = ({ seed, width, height, part = whole, look }: Drawing) => {
  const strength = look === 'edited' ? 1.12 : 0.72;
  const line = width * channels + 1;
  const pixels = Buffer.alloc(line * height);
  for (let row = 0; row < height; row += 1) {
    const y = part.top + ((row + 0.5) / height) * (part.bottom - part.top);
    for (let column = 0; column < width; column += 1) {
      const x = part.left + ((column + 0.5) / width) * (part.right - part.left);
      const [red, green, blue] = colorAt(seed, x, y);
      const grey = (red + green + blue) / channels;
      const at = row * line + 1 + column * channels;
      for (const [index, value] of [red, green, blue].entries()) {
        const toned = grey + (value - grey) * strength;
        pixels[at + index] = Math.min(255, Math.max(0, Math.round(toned)));
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([depth, trueColor], 8);
  return Buffer.concat([
    Buffer.from(signature),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

/** How large a picture drawn here is. */
export const sizeOf = (png: Buffer) => ({
  width: png.readUInt32BE(headerStart),
  height: png.readUInt32BE(headerStart + 4),
});

/** A smaller copy of a picture drawn here, as red, green, blue and alpha. */
export const shrunk = (png: Buffer, width: number, height: number) => {
  const size = sizeOf(png);
  const length = png.readUInt32BE(firstData);
  const data = png.subarray(firstData + 8, firstData + 8 + length);
  const pixels = inflateSync(data);
  const line = size.width * channels + 1;
  const small = Buffer.alloc(width * height * 4, 255);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const y = Math.floor(((row + 0.5) / height) * size.height);
      const x = Math.floor(((column + 0.5) / width) * size.width);
      const at = y * line + 1 + x * channels;
      const target = (row * width + column) * 4;
      small.set(pixels.subarray(at, at + channels), target);
    }
  }
  return small;
};
