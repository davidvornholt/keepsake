import { readGrey } from '../ui/theme.ts';
import { makeAtlas } from './atlas.ts';
import { makeDrawing, type Scene } from './draw.ts';
import { makePainter } from './gl.ts';
import { makeLoader } from './loader.ts';
import { makeTiles } from './tiles.ts';

// All that lives on the graphics card, for as long as the card keeps it.

const largeCell = 128;
const smallCell = 64;
const largeBudget = 256;
const smallBudget = 96;
/** Devices with less memory than this, in gigabytes, get the smaller copies. */
const amplMemory = 4;

const memoryOf = (): number =>
  'deviceMemory' in navigator && typeof navigator.deviceMemory === 'number'
    ? navigator.deviceMemory
    : amplMemory * 2;

const makeScene = (
  canvas: HTMLCanvasElement,
  onArrived: () => void,
): Scene | null => {
  const painter = makePainter(canvas);
  if (painter === null) {
    return null;
  }
  const hasRoom = memoryOf() > amplMemory;
  const atlas = makeAtlas(painter.gl, hasRoom ? largeCell : smallCell);
  return {
    painter,
    atlas,
    loader: makeLoader(atlas, onArrived),
    tiles: makeTiles(
      painter.gl,
      hasRoom ? largeBudget : smallBudget,
      onArrived,
    ),
    scale: 1,
    greys: {
      table: readGrey('--color-table'),
      dark: readGrey('--color-dark'),
      paper: readGrey('--color-sheet'),
    },
  };
};

/**
 * The scene, which is made anew when the graphics card has lost everything,
 * as after sleep or when a phone needed its memory for something else.
 */
export const keepScene = (
  canvas: HTMLCanvasElement,
  onArrived: () => void,
  on: { readonly lost: () => void; readonly restored: () => void },
) => {
  const first = makeScene(canvas, onArrived);
  if (first === null) {
    return null;
  }
  const held = { scene: first, drawing: makeDrawing(first) };
  const onLost = (event: Event) => {
    // Without this the browser doesn't give it back.
    event.preventDefault();
    on.lost();
  };
  const onRestored = () => {
    const next = makeScene(canvas, onArrived);
    if (next !== null) {
      next.scale = held.scene.scale;
      held.scene = next;
      held.drawing = makeDrawing(next);
      on.restored();
    }
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  return {
    held,
    release: () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    },
  };
};
