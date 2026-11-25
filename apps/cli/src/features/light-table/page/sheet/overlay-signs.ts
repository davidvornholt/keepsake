import { colorOf } from '../ui/theme.ts';

// The small signs on the frames: the sheets of a pile, the cross that closes
// it, and the heart of a favorite. Each is drawn once, on a canvas of its
// own, and put on the frames as a picture. A canvas as large as the window
// pays for each stroked path with a late frame on a screen with many pixels,
// and for a picture it doesn't.

type Sign = 'pile' | 'close' | 'heart';
type Brush = OffscreenCanvasRenderingContext2D;

/** The size the signs are written for, and the room around them for their edges. */
const drawnFor = 24;
const room = 4;

const sheetSide = 17;
const sheetStep = 6.5;
const line = 3.2;

const drawPile = (brush: Brush) => {
  const back = drawnFor - 1;
  brush.lineWidth = line;
  brush.strokeStyle = colorOf('--color-lamp');
  brush.strokeRect(1, sheetStep, sheetSide - 1, sheetSide - 1);
  brush.beginPath();
  brush.moveTo(sheetStep, sheetStep);
  brush.lineTo(sheetStep, 1);
  brush.lineTo(back, 1);
  brush.lineTo(back, sheetSide);
  brush.lineTo(sheetSide, sheetSide);
  brush.stroke();
};

const drawClose = (brush: Brush) => {
  brush.lineWidth = line;
  brush.strokeStyle = colorOf('--color-lamp');
  brush.beginPath();
  brush.moveTo(1, 1);
  brush.lineTo(drawnFor - 1, drawnFor - 1);
  brush.moveTo(drawnFor - 1, 1);
  brush.lineTo(1, drawnFor - 1);
  brush.stroke();
};

const heartEdge = 3;

/** A heart, as Immich shows its favorites, with a dark edge so it reads on any photo. */
const drawHeart = (brush: Brush) => {
  const path = new Path2D(
    'M12 21C5.5 15.6 2 12.3 2 8.4 2 5.4 4.4 3 7.4 3c1.8 0 3.5.9 4.6 2.3C13.1 3.9 14.8 3 16.6 3 19.6 3 22 5.4 22 8.4c0 3.9-3.5 7.2-10 12.6z',
  );
  brush.lineWidth = heartEdge;
  brush.lineJoin = 'round';
  brush.strokeStyle = colorOf('--color-shade');
  brush.stroke(path);
  brush.fillStyle = colorOf('--color-wax-white');
  brush.fill(path);
};

const drawings: Readonly<Record<Sign, (brush: Brush) => void>> = {
  pile: drawPile,
  close: drawClose,
  heart: drawHeart,
};

/** Signs whose sizes differ by less than this, in device pixels, share a canvas. */
const sizeStep = 4;
const canvases = new Map<string, OffscreenCanvas>();

const canvasOf = (sign: Sign, pixels: number): OffscreenCanvas => {
  const side = Math.max(1, Math.ceil(pixels / sizeStep)) * sizeStep;
  const key = `${sign} ${side}`;
  const known = canvases.get(key);
  if (known !== undefined) {
    return known;
  }
  const canvas = new OffscreenCanvas(side, side);
  const brush = canvas.getContext('2d');
  if (brush !== null) {
    const scale = side / (drawnFor + room * 2);
    brush.setTransform(scale, 0, 0, scale, room * scale, room * scale);
    drawings[sign](brush);
  }
  canvases.set(key, canvas);
  return canvas;
};

/** Puts a sign on a frame. `scale` is how many device pixels the canvas has for each of its own. */
export const stampSign = (
  pencil: CanvasRenderingContext2D,
  sign: Sign,
  {
    x,
    y,
    size,
  }: { readonly x: number; readonly y: number; readonly size: number },
  scale: number,
): void => {
  const pad = (size * room) / drawnFor;
  const side = size + pad * 2;
  pencil.drawImage(canvasOf(sign, side * scale), x - pad, y - pad, side, side);
};
