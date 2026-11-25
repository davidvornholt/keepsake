import { useEffect, useRef } from 'react';
import { colorOf, prefersReducedMotion } from '../ui/theme.ts';
import { glyphOf, type Shape, seedOf } from './glyphs.ts';
import { addGrain, drawingTime, drawWax } from './wax.ts';

// A mark in wax as part of the page: on a button, in a list. A mark that was
// just made is drawn stroke by stroke.

type Props = {
  readonly shape: Shape;
  /** What the mark is drawn from; the same text gives the same strokes. */
  readonly seed: string;
  /** A wax pencil, the agent's blue one, or a grey for a mark that isn't made. */
  readonly color:
    | 'wax-white'
    | 'wax-yellow'
    | 'wax-red'
    | 'pencil-blue'
    | 'quiet'
    | 'rule';
  /** The size is set here, as a class. */
  readonly className: string;
  /** When it was made, in milliseconds, if it was made just now. */
  readonly since?: number | null;
  /** How heavy the strokes are: 1 for wax, less for a pencil. */
  readonly weight?: number;
};

const mostScale = 3;
/** Room for strokes that go over the edge, as a share of the size. */
const room = 0.14;
const grainFrom = 40;

export const WaxMark = ({
  shape,
  seed,
  color,
  className,
  since = null,
  weight = 1,
}: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const pencil = canvas?.getContext('2d') ?? null;
    if (canvas === null || pencil === null) {
      return;
    }
    const scale = Math.min(globalThis.devicePixelRatio, mostScale);
    const size = canvas.clientWidth;
    canvas.width = Math.round(size * scale);
    canvas.height = Math.round(size * scale);
    const glyph = glyphOf(shape, seedOf(seed));
    const pad = size * room;
    const side = size - pad * 2;
    let waiting = 0;
    const draw = (now: number) => {
      const progress =
        since === null || prefersReducedMotion()
          ? 1
          : (now - since) / drawingTime;
      pencil.setTransform(scale, 0, 0, scale, 0, 0);
      pencil.clearRect(0, 0, size, size);
      drawWax(
        pencil,
        glyph,
        { x: pad, y: pad, w: side, h: side },
        { color: colorOf(`--color-${color}`), progress, weight: side * weight },
      );
      if (progress < 1) {
        waiting = requestAnimationFrame(draw);
      } else if (size >= grainFrom) {
        addGrain(pencil, [{ x: 0, y: 0, w: canvas.width, h: canvas.height }]);
      }
    };
    draw(performance.now());
    return () => cancelAnimationFrame(waiting);
  }, [shape, seed, color, since, weight]);

  return (
    <span aria-hidden="true" className={`inline-block shrink-0 ${className}`}>
      <canvas className="block size-full" ref={canvasRef} />
    </span>
  );
};
