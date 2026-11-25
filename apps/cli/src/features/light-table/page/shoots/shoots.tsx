import { useMemo, useRef } from 'react';
import { everything, hrefOf } from '../app/route.ts';
import { go } from '../app/router.ts';
import { count } from '../data/format.ts';
import { blurOf } from '../data/pictures.ts';
import { usePicture } from '../photo/use-picture.ts';
import { sideButton } from '../ui/classes.ts';
import { useKeys } from '../ui/keys.ts';
import { Img, Placed } from '../ui/placed.tsx';
import { useSize } from '../ui/use-size.ts';
import { useTitle } from '../ui/use-title.ts';
import { useWindowSize } from '../ui/use-window.ts';
import { startArrival } from './arrival.ts';
import { mosaicOf, rowHeightIn, type Tile } from './mosaic.ts';
import { type ShootSummary, useShoots } from './use-shoots.ts';
import { printOf, wantsOf } from './words.ts';

// The start: every shoot as a sheet of its photos lying on the table. One
// shoot fills the window; several share it. Looking at one puts the others
// in the shade.

/** Between the photos of a sheet, in pixels. */
const gap = 3;

const Cover = ({ tile }: { readonly tile: Tile }) => {
  const src = usePicture(tile.picture, tile.w * globalThis.devicePixelRatio);
  return (
    <Placed
      blur={tile.picture === null ? '' : blurOf(tile.picture)}
      className="overflow-hidden bg-dark"
      rect={tile}
    >
      {src === null ? null : (
        <Img className="size-full object-cover" src={src} />
      )}
    </Placed>
  );
};

/** The photos that stand for a shoot, filling whatever room the sheet has. */
const Mosaic = ({ shoot }: { readonly shoot: ShootSummary }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const box = useSize(ref);
  const window = useWindowSize();
  const rowHeight = rowHeightIn(window);
  const tiles = useMemo(
    () => mosaicOf(shoot.covers, box, { rowHeight, gap }),
    [shoot.covers, box, rowHeight],
  );
  return (
    <span
      aria-hidden="true"
      className="relative block min-h-0 flex-1"
      data-strip={true}
      ref={ref}
    >
      {tiles.map((tile) => (
        <Cover key={tile.key} tile={tile} />
      ))}
    </span>
  );
};

const isPlain = (event: {
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly button: number;
}): boolean =>
  !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) &&
  event.button === 0;

const rectOf = (element: Element) => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { x: left, y: top, w: width, h: height };
};

/** Notes where the photos of a sheet are, so that they can go on to its table. */
const depart = (shoot: string, sheet: HTMLElement) => {
  const flying = [...sheet.querySelectorAll('img')].flatMap((image) => {
    const frame = image.parentElement;
    const url = image.currentSrc;
    return frame === null || url === ''
      ? []
      : [{ src: new URL(url).pathname, url, rect: rectOf(frame) }];
  });
  startArrival(shoot, rectOf(sheet), flying);
};

const ShootRow = ({ shoot }: { readonly shoot: ShootSummary }) => {
  const wants = wantsOf(shoot);
  const route = {
    screen: 'sheet',
    shoot: shoot.name,
    filters: everything,
  } as const;
  return (
    <li className="min-h-0">
      <a
        className="flex h-full flex-col bg-sheet p-2.5 sm:px-3.5 sm:pt-3 sm:pb-3.5"
        data-shoot={true}
        href={hrefOf(route)}
        onClick={(event) => {
          if (isPlain(event)) {
            event.preventDefault();
            depart(shoot.name, event.currentTarget);
            go(route);
          }
        }}
      >
        <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 pb-2.5">
          <span className="type-name text-[1.25rem] text-lamp sm:text-[1.5rem]">
            {shoot.about ?? shoot.name}
          </span>
          <span className="type-edge flex flex-wrap gap-x-3.5 gap-y-1 text-quiet">
            {printOf(shoot).map((part) => (
              <span key={part}>{part}</span>
            ))}
          </span>
          {wants.answers === null && wants.marks === null ? null : (
            <span className="type-label flex gap-x-4 sm:ml-auto">
              {wants.marks === null ? null : (
                <span className="text-wax-yellow">{wants.marks}</span>
              )}
              {wants.answers === null ? null : (
                <span className="text-pencil-blue">{wants.answers}</span>
              )}
            </span>
          )}
        </span>
        <Mosaic shoot={shoot} />
      </a>
    </li>
  );
};

const Problem = ({
  problem,
  onRetry,
}: {
  readonly problem: string | null;
  readonly onRetry: () => void;
}) => (
  <div className="grid flex-1 place-items-center p-6">
    <div className="max-w-[28rem]">
      <h2 className="type-name text-lamp text-xl">Keepsake doesn't answer.</h2>
      {problem === null ? null : <p className="mt-2 text-quiet">{problem}</p>}
      <button className={`${sideButton} mt-6`} onClick={onRetry} type="button">
        Try again
      </button>
    </div>
  </div>
);

export const Shoots = () => {
  const { status, shoots, problem, retry } = useShoots();
  const listRef = useRef<HTMLUListElement>(null);
  useTitle(null);

  const move = (by: number | 'first' | 'last') => () => {
    const links = [...(listRef.current?.querySelectorAll('a') ?? [])];
    const on = document.activeElement;
    const at = on instanceof HTMLAnchorElement ? links.indexOf(on) : -1;
    const last = links.length - 1;
    const next = at === -1 ? 0 : at + (typeof by === 'number' ? by : 0);
    const to = { first: 0, last, next }[typeof by === 'number' ? 'next' : by];
    links[Math.min(last, Math.max(0, to))]?.focus();
  };
  useKeys([
    ['ArrowDown', move(1)],
    ['ArrowUp', move(-1)],
    ['Home', move('first')],
    ['End', move('last')],
  ]);

  return (
    <main
      aria-busy={status === 'loading'}
      className="flex h-full flex-col overflow-y-auto overscroll-contain"
    >
      <header className="flex shrink-0 items-baseline gap-4 px-4 pt-3.5 pb-2.5 sm:px-5">
        <h1 className="type-name text-[1.0625rem] text-lamp">Keepsake</h1>
        {status === 'ready' ? (
          <p className="type-edge text-quiet">
            {count(shoots.length, 'shoot')}
          </p>
        ) : null}
      </header>
      {status === 'failed' ? (
        <Problem onRetry={retry} problem={problem} />
      ) : null}
      {status === 'ready' && shoots.length === 0 ? (
        <p className="type-name grid flex-1 place-items-center p-6 text-lamp text-xl">
          No shoots yet.
        </p>
      ) : null}
      <ul
        className="grid flex-1 auto-rows-[minmax(9.5rem,1fr)] gap-1.5 px-1.5 pb-1.5 sm:gap-2 sm:px-2 sm:pb-2"
        data-shelf={true}
        ref={listRef}
      >
        {shoots.map((shoot) => (
          <ShootRow key={shoot.name} shoot={shoot} />
        ))}
      </ul>
    </main>
  );
};
