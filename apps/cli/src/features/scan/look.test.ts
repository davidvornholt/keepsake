import { describe, expect, it } from 'bun:test';
import { type Look, likeness, lookOf } from './look.ts';

const width = 48;
const height = 32;

/** A look of what `paint` shows at each point from 0 to 1 across and down. */
const lookFrom = (paint: (x: number, y: number) => number): Look => {
  const channel = (colour: number) =>
    Float32Array.from({ length: width * height }, (_, index) =>
      paint(
        ((index % width) + 0.5) / width,
        (Math.floor(index / width) + 0.5) / height + colour * 0.1,
      ),
    );
  return { width, height, channels: [channel(0), channel(1), channel(2)] };
};

const hills = (x: number, y: number) =>
  Math.sin(x * 9) * Math.cos(y * 7) + Math.sin(x * 4 + y * 13) / 2;
const ripples = (x: number, y: number) =>
  Math.sin(x * 31 + 1) * Math.sin(y * 23 + 2);

describe('lookOf', () => {
  it('reads the colours of a PPM picture', () => {
    const header = new TextEncoder().encode('P6\n2 1\n255\n');
    const ppm = new Uint8Array([...header, 255, 0, 0, 0, 0, 255]);
    const look = lookOf(ppm);
    expect(look?.width).toBe(2);
    expect(look?.height).toBe(1);
    const [light, redGreen, yellowBlue] = look?.channels ?? [];
    expect(light?.[0]).toBeCloseTo(0.299);
    expect(redGreen?.[0]).toBeCloseTo(1);
    expect(yellowBlue?.[1]).toBeCloseTo(-1);
  });

  it('refuses what isn’t a whole PPM picture', () => {
    expect(lookOf(new TextEncoder().encode('P5\n2 1\n255\n..'))).toBeNull();
    expect(lookOf(new TextEncoder().encode('P6\n2 1\n255\n...'))).toBeNull();
  });
});

describe('likeness', () => {
  it('finds the same picture alike', () => {
    expect(likeness(lookFrom(hills), lookFrom(hills), 1)).toBeCloseTo(1);
  });

  it('finds the picture when the camera moved', () => {
    const moved = lookFrom((x, y) => hills(x + 0.1, y - 0.05));
    expect(likeness(lookFrom(hills), moved, 1)).toBeGreaterThan(0.95);
  });

  it('finds the picture when the camera zoomed in', () => {
    const zoom = 1.2;
    const closer = lookFrom((x, y) =>
      hills(0.5 + (x - 0.5) / zoom, 0.5 + (y - 0.5) / zoom),
    );
    expect(likeness(lookFrom(hills), closer, zoom)).toBeGreaterThan(0.95);
  });

  it('tells different pictures apart', () => {
    expect(likeness(lookFrom(hills), lookFrom(ripples), 1)).toBeLessThan(0.5);
  });
});
