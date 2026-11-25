import type { Filters, Show } from '../app/route.ts';
import { type Index, sectionsOf } from '../data/derive.ts';
import { chosenName } from '../data/words.ts';
import { tab } from '../ui/classes.ts';
import { Key } from '../ui/controls.tsx';

// Which photos lie on the table: all of them, the album, or what was left out.

const viewsOf = (
  index: Index,
): ReadonlyArray<{
  readonly show: Show;
  readonly name: string;
  readonly key: string;
}> => [
  { show: 'all', name: 'Everything', key: '1' },
  { show: 'album', name: chosenName(index), key: '2' },
  { show: 'left', name: 'Left out', key: '3' },
];

const countOf = (index: Index, filters: Filters, show: Show): number =>
  sectionsOf(index, { ...filters, show, why: null }).reduce(
    (sum, { photos }) => sum + photos.length,
    0,
  );

export const Views = ({
  index,
  filters,
  onShow,
}: {
  readonly index: Index;
  readonly filters: Filters;
  readonly onShow: (show: Show) => void;
}) =>
  // While nothing has been chosen, nothing was left out either.
  index.chosen === 0 && filters.show === 'all' ? null : (
    <ul aria-label="Which photos" className="flex shrink-0 items-center">
      {viewsOf(index).map(({ show, name, key }) => (
        <li key={show}>
          <button
            aria-keyshortcuts={key}
            aria-pressed={filters.show === show}
            className={tab}
            onClick={() => onShow(show)}
            type="button"
          >
            <span className="flex items-baseline gap-1.5">
              <span>{name}</span>
              <span className="type-edge tabular">
                {countOf(index, filters, show)}
              </span>
              <span className="max-lg:hidden">
                <Key>{key}</Key>
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
