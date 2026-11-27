import { Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { hrefOf, type Route } from '../app/route.ts';
import { go } from '../app/router.ts';
import { startWalk } from '../app/walk.ts';
import { newsIn } from '../app/walk-order.ts';
import { count } from '../data/format.ts';
import { pencilButton, sideButton } from '../ui/classes.ts';
import { Key } from '../ui/controls.tsx';
import { useKeys } from '../ui/keys.ts';
import { useTitle } from '../ui/use-title.ts';
import { Album, NewPlace } from './album.tsx';
import { lastOpened, noteOpened } from './opened.ts';
import { stepFrom } from './steps.ts';
import { type ShootSummary, useShoots } from './use-shoots.ts';

// The start: a shelf with every album on it, each a pile of prints to open,
// and at its end the place where the next one goes.

const iconSize = 16;

/** The fewer albums there are, the larger they lie on the shelf. */
const columns = {
  few: 'grid-cols-[repeat(auto-fill,minmax(min(100%,max(34rem,30vw)),1fr))]',
  some: 'grid-cols-[repeat(auto-fill,minmax(min(100%,max(28rem,22vw)),1fr))]',
  many: 'grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))]',
} as const;
const fewUpTo = 2;
const someUpTo = 5;

const columnsFor = (albums: number): string => {
  if (albums <= fewUpTo) {
    return columns.few;
  }
  return albums <= someUpTo ? columns.some : columns.many;
};

const toNew: Route = { screen: 'new', folder: null };

const Problem = ({
  problem,
  onRetry,
}: {
  readonly problem: string | null;
  readonly onRetry: () => void;
}) => (
  <div className="grid flex-1 place-items-center p-6">
    <div className="max-w-[28rem]">
      <h2 className="type-name text-lamp text-xl">Keepsake doesn’t answer.</h2>
      {problem === null ? null : <p className="mt-2 text-quiet">{problem}</p>}
      <button className={`${sideButton} mt-6`} onClick={onRetry} type="button">
        Try again
      </button>
    </div>
  </div>
);

/** The arrow keys go from album to album, as they lie on the shelf. */
const useArrows = (listRef: React.RefObject<HTMLUListElement | null>) => {
  const move = (key: string) => () => {
    const links = [...(listRef.current?.querySelectorAll('a') ?? [])];
    const on = document.activeElement;
    const at = on instanceof HTMLAnchorElement ? links.indexOf(on) : -1;
    const to = stepFrom(
      links.map((link) => {
        const { left, top } = link.getBoundingClientRect();
        return { x: left, y: top };
      }),
      at,
      key,
    );
    links[to]?.focus();
  };
  useKeys([
    ['ArrowRight', move('ArrowRight')],
    ['ArrowLeft', move('ArrowLeft')],
    ['ArrowDown', move('ArrowDown')],
    ['ArrowUp', move('ArrowUp')],
    ['Home', move('Home')],
    ['End', move('End')],
    ['n', () => go(toNew)],
  ]);
};

/** The way to everything new in all the albums, oldest first. */
const News = ({ shoots }: { readonly shoots: ReadonlyArray<ShootSummary> }) => {
  const news = newsIn(shoots);
  return news === 0 ? null : (
    <button
      className={`${pencilButton} whitespace-nowrap`}
      onClick={() => startWalk(shoots)}
      type="button"
    >
      {count(news, 'new thing')} to look at
    </button>
  );
};

const NewAlbum = () => (
  <a
    aria-keyshortcuts="N"
    className={sideButton}
    href={hrefOf(toNew)}
    onClick={(event) => {
      event.preventDefault();
      go(toNew);
    }}
  >
    <Plus aria-hidden="true" size={iconSize} />
    New album <Key>N</Key>
  </a>
);

export const Shelf = () => {
  const { status, shoots, problem, retry } = useShoots();
  const listRef = useRef<HTMLUListElement>(null);
  useTitle(null);
  useArrows(listRef);

  const isReady = status === 'ready';
  // Coming back from an album, the keyboard is on that album again.
  useEffect(() => {
    const opened = lastOpened();
    if (isReady && opened !== null) {
      noteOpened(null);
      listRef.current
        ?.querySelector<HTMLElement>(`[data-album="${CSS.escape(opened)}"]`)
        ?.focus();
    }
  }, [isReady]);

  return (
    <main
      aria-busy={status === 'loading'}
      className="flex h-full flex-col overflow-y-auto overscroll-contain"
    >
      <header className="flex shrink-0 items-center gap-4 px-5 pt-3 pb-2 sm:px-8">
        <h1 className="type-name text-[1.0625rem] text-lamp">Keepsake</h1>
        {isReady && shoots.length > 0 ? (
          <p className="type-edge text-quiet">
            {count(shoots.length, 'album')}
          </p>
        ) : null}
        <div className="ml-auto flex items-center gap-x-4">
          {isReady ? <News shoots={shoots} /> : null}
          {isReady ? <NewAlbum /> : null}
        </div>
      </header>
      {status === 'failed' ? (
        <Problem onRetry={retry} problem={problem} />
      ) : null}
      {isReady ? (
        <ul
          className={`grid ${columnsFor(shoots.length)} gap-x-4 gap-y-8 px-2 pt-4 pb-12 sm:px-5`}
          data-shelf={true}
          ref={listRef}
        >
          {shoots.map((shoot, at) => (
            <li key={shoot.name}>
              <Album lean={at % 2 === 0 ? 0 : 1} shoot={shoot} />
            </li>
          ))}
          <li>
            <NewPlace isFirst={shoots.length === 0} />
          </li>
          {shoots.length === 0 ? (
            <li className="col-span-full max-w-[34rem] px-3 text-quiet sm:col-span-1 sm:self-center">
              <p className="type-name text-lamp text-xl">No albums yet.</p>
              <p className="mt-3">
                An album starts from a folder of your camera’s photos. Keepsake
                looks at every one and chooses the best. You go over the choice,
                and only then are they edited and put into Immich.
              </p>
            </li>
          ) : null}
        </ul>
      ) : null}
    </main>
  );
};
