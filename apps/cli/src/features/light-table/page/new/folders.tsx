import { ArrowUpRight, Search } from 'lucide-react';
import { type KeyboardEvent, type MouseEvent, useId, useState } from 'react';
import { everything, hrefOf, type Route } from '../app/route.ts';
import { go } from '../app/router.ts';
import { count, localStamp, span } from '../data/format.ts';
import { field, tab } from '../ui/classes.ts';
import { useFocused } from '../ui/use-focused.ts';
import { type Folder, type Row, rowsOf, yearsOf } from './tree.ts';

// The first step: the folder with the photos. The newest are first, each
// with the folders below it; typing finds one by its name.

const iconSize = 16;

const isPlain = (event: MouseEvent): boolean =>
  !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) &&
  event.button === 0;

/** How far in a folder is set that lies in others. */
const insets = ['', 'pl-6', 'pl-12', 'pl-[4.5rem]', 'pl-24'] as const;

const routeOf = ({ shoot, path }: Folder): Route =>
  shoot === null
    ? { screen: 'new', folder: path }
    : { screen: 'sheet', shoot, filters: everything };

const FolderRow = ({
  row: { folder, depth, below },
  isFlat,
}: {
  readonly row: Row;
  /** Whether the folders it lies in are named, since they aren't above it. */
  readonly isFlat: boolean;
}) => {
  const route = routeOf(folder);
  const dates = span(localStamp(folder.from), localStamp(folder.to));
  return (
    <li>
      <a
        className={`group flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-raised border-t py-3 pr-2 transition-colors duration-150 hover:bg-dark ${insets[Math.min(depth, insets.length - 1)] ?? ''}`}
        data-folder={true}
        href={hrefOf(route)}
        onClick={(event) => {
          if (isPlain(event)) {
            event.preventDefault();
            go(route);
          }
        }}
      >
        <span className="min-w-0 flex-1 basis-56 pl-2">
          {isFlat && folder.within.length > 0 ? (
            <span className="text-quiet">{folder.within.join(' / ')} / </span>
          ) : null}
          <span className="type-label break-words text-[1.0625rem] text-print group-hover:text-lamp">
            {folder.name}
          </span>
        </span>
        <span className="type-edge flex flex-wrap gap-x-4 gap-y-0.5 pl-2 text-quiet">
          {folder.shoot === null ? null : (
            <span className="flex items-center gap-1 text-pencil-blue">
              Open its album
              <ArrowUpRight aria-hidden="true" size={12} />
            </span>
          )}
          <span>{count(folder.photos, 'photo')}</span>
          {below > 0 ? <span>{count(below, 'folder')} below</span> : null}
          <span>{dates}</span>
        </span>
      </a>
    </li>
  );
};

/** The arrow keys go down and up the list, and up from its top to the search. */
const onArrows = (event: KeyboardEvent<HTMLElement>) => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
    return;
  }
  const rows = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      'input[type=search], a[data-folder]',
    ),
  ];
  const on = document.activeElement;
  const at = on instanceof HTMLElement ? rows.indexOf(on) : -1;
  const next = rows[at + (event.key === 'ArrowDown' ? 1 : -1)];
  if (next !== undefined) {
    event.preventDefault();
    next.focus();
  }
};

export const Folders = ({
  folders,
}: {
  readonly folders: ReadonlyArray<Folder>;
}) => {
  const titleId = useId();
  const searchRef = useFocused<HTMLInputElement>();
  const [search, setSearch] = useState('');
  const [year, setYear] = useState<number | null>(null);
  const years = yearsOf(folders);
  const rows = rowsOf(folders, { search, year });
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: the arrow keys only move between the controls inside, which have their own roles
    <section aria-labelledby={titleId} className="pt-8" onKeyDown={onArrows}>
      <h2 className="type-name text-[1.375rem] text-lamp" id={titleId}>
        Which folder has the photos?
      </h2>
      <p className="mt-2.5 max-w-[36rem] text-quiet">
        Keepsake looks at every photo in it and in the folders below it, and
        chooses the best for an album. Nothing in the folder is changed.
      </p>
      <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="relative min-w-0 flex-1 basis-64">
          <span className="sr-only">Search folders</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-3.5 left-3.5 text-quiet"
            size={iconSize}
          />
          <input
            ref={searchRef}
            className={`${field} pl-10`}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search folders"
            type="search"
            value={search}
          />
        </label>
        {years.length > 1 ? (
          <ul aria-label="Year" className="flex shrink-0 items-center">
            {[null, ...years].map((one) => (
              <li key={one ?? 'all'}>
                <button
                  aria-pressed={year === one}
                  className={tab}
                  onClick={() => setYear(one)}
                  type="button"
                >
                  {one ?? 'All'}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <ul aria-label="Folders, the newest first" className="mt-4">
        {rows.map((row) => (
          <FolderRow
            isFlat={search.trim() !== ''}
            key={row.folder.path}
            row={row}
          />
        ))}
      </ul>
      <p aria-live="polite" className="border-raised border-t pt-4 text-quiet">
        {rows.length === 0 ? 'No folder is called that.' : ''}
      </p>
    </section>
  );
};
