import { ChevronLeft } from 'lucide-react';
import type { MouseEvent } from 'react';
import { go } from '../app/router.ts';
import type { Index } from '../data/derive.ts';
import { count, dollarsOf } from '../data/format.ts';
import { iconButton } from '../ui/classes.ts';

// What the shoot is called, and what the machine counted, like the label on
// a box of contact sheets.

const iconSize = 20;

const isPlain = (event: MouseEvent): boolean =>
  !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) &&
  event.button === 0;

type Total = {
  readonly text: string;
  /** Left out where room is short. */
  readonly isMinor?: boolean;
};

const totalsOf = (index: Index): ReadonlyArray<Total> => {
  const { shoot } = index;
  const edited = shoot.photos.filter(({ edit }) => edit !== null).length;
  const most = shoot.picked?.maximum ?? null;
  const picked = index.chosen - index.inAlbum;
  return [
    { text: `${shoot.photos.length} taken` },
    ...(index.hasAlbum
      ? [
          {
            text: `${index.inAlbum} in the album${most === null ? '' : ` of ${most}`}`,
          },
        ]
      : []),
    ...(picked > 0 ? [{ text: `${picked} chosen` }] : []),
    { text: count(shoot.moments.length, 'moment'), isMinor: true },
    ...(edited > 0 ? [{ text: `${edited} edited`, isMinor: true }] : []),
    ...(shoot.dollars.spent > 0
      ? [{ text: `${dollarsOf(shoot.dollars.spent)} spent` }]
      : []),
  ];
};

export const Title = ({ index }: { readonly index: Index }) => (
  <div className="flex min-w-0 flex-1 basis-60 items-center gap-1 lg:basis-[28.5rem]">
    <a
      aria-label="All shoots"
      className={iconButton}
      href="/"
      onClick={(event) => {
        if (isPlain(event)) {
          event.preventDefault();
          go({ screen: 'shoots' });
        }
      }}
      title="All shoots"
    >
      <ChevronLeft aria-hidden="true" size={iconSize} />
    </a>
    <div className="min-w-0">
      <h1 className="type-name truncate text-[1.0625rem] text-lamp">
        {index.shoot.about ?? index.shoot.name}
      </h1>
      <p className="type-edge mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-quiet max-sm:h-[1lh] max-sm:overflow-hidden">
        {totalsOf(index).map(({ text, isMinor }) => (
          <span
            className={`whitespace-nowrap ${isMinor ? 'max-sm:hidden' : ''}`}
            key={text}
          >
            {text}
          </span>
        ))}
      </p>
    </div>
  </div>
);
