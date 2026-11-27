import { Plus } from 'lucide-react';
import { type MouseEvent, useMemo, useRef } from 'react';
import { everything, hrefOf, type Route } from '../app/route.ts';
import { go } from '../app/router.ts';
import { percentOf } from '../data/activity.ts';
import { blurOf } from '../data/pictures.ts';
import { usePicture } from '../photo/use-picture.ts';
import { Meter } from '../ui/controls.tsx';
import { Img, Placed } from '../ui/placed.tsx';
import { useSize } from '../ui/use-size.ts';
import { startArrival } from './arrival.ts';
import { type Print, pileOf } from './pile.ts';
import type { ShootSummary } from './use-shoots.ts';
import { printOf, readyShare, type Waits, waitsOf } from './words.ts';

// One album on the shelf: a small pile of its prints with its name under
// it. The whole of it is one thing to open; the prints fan out a little
// under the pointer, and go on to their places on the table when it is.

const iconSize = 22;

/**
 * How the prints under the cover lie, and how far they come out when the
 * album is pointed at. Every other album leans the other way.
 */
const lying = [
  [
    'transition-transform duration-300 ease-out group-hover:-translate-y-1 group-focus-visible:-translate-y-1',
    'transition-transform duration-300 ease-out -translate-x-[2%] translate-y-[2%] -rotate-[4deg] group-hover:-translate-x-[5%] group-hover:-rotate-[7deg] group-focus-visible:-translate-x-[5%] group-focus-visible:-rotate-[7deg]',
    'transition-transform duration-300 ease-out translate-x-[2.5%] -translate-y-[1%] rotate-[3deg] group-hover:translate-x-[6%] group-hover:rotate-[6deg] group-focus-visible:translate-x-[6%] group-focus-visible:rotate-[6deg]',
  ],
  [
    'transition-transform duration-300 ease-out group-hover:-translate-y-1 group-focus-visible:-translate-y-1',
    'transition-transform duration-300 ease-out translate-x-[2%] translate-y-[2%] rotate-[3.6deg] group-hover:translate-x-[5%] group-hover:rotate-[6.6deg] group-focus-visible:translate-x-[5%] group-focus-visible:rotate-[6.6deg]',
    'transition-transform duration-300 ease-out -translate-x-[2.5%] -translate-y-[1%] -rotate-[2.6deg] group-hover:-translate-x-[6%] group-hover:-rotate-[5.6deg] group-focus-visible:-translate-x-[6%] group-focus-visible:-rotate-[5.6deg]',
  ],
] as const;

const PrintOf = ({
  print,
  lean,
}: {
  readonly print: Print;
  readonly lean: 0 | 1;
}) => {
  const src = usePicture(
    print.picture,
    print.rect.w * globalThis.devicePixelRatio,
  );
  return (
    <Placed
      blur={blurOf(print.picture)}
      className={`overflow-hidden bg-dark shadow-[0_2px_10px_var(--color-shade)] motion-reduce:transition-none ${lying[lean][print.depth] ?? ''}`}
      rect={print.rect}
    >
      {src === null ? null : (
        <Img className="size-full object-cover" src={src} />
      )}
    </Placed>
  );
};

/** The prints that stand for an album, or an empty sheet while it has none. */
const Pile = ({
  shoot,
  lean,
}: {
  readonly shoot: ShootSummary;
  readonly lean: 0 | 1;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const box = useSize(ref);
  const prints = useMemo(() => pileOf(shoot.covers, box), [shoot.covers, box]);
  const isStopped = (shoot.preparation?.stopped ?? null) !== null;
  return (
    <span
      aria-hidden="true"
      className={`relative block aspect-[3/2] transition-opacity duration-300 ${isStopped ? 'opacity-45' : ''}`}
      data-pile={true}
      ref={ref}
    >
      {shoot.covers.length === 0 ? (
        <span
          className={`type-edge absolute inset-[4%] grid place-items-center bg-sheet text-quiet shadow-[0_2px_10px_var(--color-shade)] ${shoot.preparation === null || isStopped ? '' : 'paper-waits'}`}
        >
          No photos yet
        </span>
      ) : null}
      {box.width === 0
        ? null
        : prints.map((print) => (
            <PrintOf key={print.picture.src} lean={lean} print={print} />
          ))}
    </span>
  );
};

const isPlain = (event: MouseEvent): boolean =>
  !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) &&
  event.button === 0;

/**
 * Notes where the prints of a pile are, so that they can go on to the table
 * of their album. A print lies where its place is, however it is turned.
 */
const depart = (shoot: string, pile: HTMLElement) => {
  const { left, top, width, height } = pile.getBoundingClientRect();
  const flying = [...pile.querySelectorAll('img')].flatMap((image) => {
    const print = image.parentElement;
    const url = image.currentSrc;
    return print === null || url === ''
      ? []
      : [
          {
            src: new URL(url).pathname,
            url,
            rect: {
              x: left + print.offsetLeft,
              y: top + print.offsetTop,
              w: print.offsetWidth,
              h: print.offsetHeight,
            },
          },
        ];
  });
  startArrival(shoot, { x: left, y: top, w: width, h: height }, flying);
};

const tones: Readonly<Record<Waits['who'], string>> = {
  owner: 'text-wax-yellow',
  pencil: 'text-pencil-blue',
  keepsake: 'text-lamp',
  nobody: 'text-quiet',
};

const Waiting = ({ waits }: { readonly waits: ReadonlyArray<Waits> }) =>
  waits.length === 0 ? null : (
    <span className="mt-2 flex flex-col gap-y-0.5">
      {waits.map(({ text, more, who }) => (
        <span className="flex flex-wrap items-baseline gap-x-2" key={text}>
          <span className={`type-label ${tones[who]}`}>{text}</span>
          {more === null ? null : (
            <span className="text-quiet text-xs">{more}</span>
          )}
        </span>
      ))}
    </span>
  );

/** Remembers how far it got, so that the line never goes back between two steps. */
const useFurthest = (shoot: ShootSummary): number | null => {
  const furthestRef = useRef(0);
  if (shoot.preparation === null) {
    furthestRef.current = 0;
    return null;
  }
  furthestRef.current = Math.max(furthestRef.current, readyShare(shoot));
  return furthestRef.current;
};

export const Album = ({
  shoot,
  lean,
}: {
  readonly shoot: ShootSummary;
  readonly lean: 0 | 1;
}) => {
  const route: Route = {
    screen: 'sheet',
    shoot: shoot.name,
    filters: everything,
  };
  const share = useFurthest(shoot);
  const name = shoot.title;
  return (
    <a
      className="group block p-3"
      data-album={shoot.name}
      href={hrefOf(route)}
      onClick={(event) => {
        const pile = event.currentTarget.querySelector('[data-pile]');
        if (isPlain(event) && pile instanceof HTMLElement) {
          event.preventDefault();
          depart(shoot.name, pile);
          go(route);
        }
      }}
    >
      <Pile lean={lean} shoot={shoot} />
      {share === null ? (
        <span className="mt-4 block h-0.5" />
      ) : (
        <Meter
          className="mt-4 w-full"
          label={`Prepared ${percentOf(share)}`}
          share={share}
        />
      )}
      <span className="type-name mt-2.5 block break-words text-[1.1875rem] text-lamp">
        {name}
      </span>
      <span className="type-edge mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-quiet">
        {printOf(shoot).map((part) => (
          <span key={part}>{part}</span>
        ))}
      </span>
      <Waiting waits={waitsOf(shoot)} />
    </a>
  );
};

/** The place on the shelf where the next album goes. */
export const NewPlace = ({ isFirst }: { readonly isFirst: boolean }) => {
  const route: Route = { screen: 'new', folder: null };
  return (
    <a
      aria-keyshortcuts="N"
      className="group block p-3"
      data-album=""
      href={hrefOf(route)}
      onClick={(event) => {
        if (isPlain(event)) {
          event.preventDefault();
          go(route);
        }
      }}
    >
      <span className="block aspect-[3/2] p-[4%]">
        <span className="grid size-full place-items-center border border-rule border-dashed text-quiet transition-colors duration-200 group-hover:border-lamp group-hover:text-lamp group-focus-visible:border-lamp group-focus-visible:text-lamp">
          <Plus aria-hidden="true" size={iconSize} />
        </span>
      </span>
      <span className="mt-4 block h-0.5" />
      <span className="type-name mt-2.5 block text-[1.1875rem] text-lamp">
        {isFirst ? 'Your first album' : 'New album'}
      </span>
      <span className="type-edge mt-1.5 block text-quiet">
        From a folder of your photos
      </span>
    </a>
  );
};
