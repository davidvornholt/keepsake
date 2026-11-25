import { type Filters, type Show, type Why, whys } from '../app/route.ts';
import { type Counts, countsOf, type Index } from '../data/derive.ts';
import { count } from '../data/format.ts';
import { chosenName } from '../data/words.ts';
import { whyTitles } from '../sheet/content.ts';
import { tab } from '../ui/classes.ts';
import { Key } from '../ui/controls.tsx';

// Which photos lie on the table: all of them, the album, or what was left
// out, and of that what was not strong enough or what the owner took out.
// Photos that show the same count once, as the stack they lie in, so the
// numbers add up.

type View = {
  readonly show: Show;
  readonly name: string;
  readonly key: string;
  readonly count: number;
  /** What the number counts, said in full. */
  readonly says: string;
};

const viewsOf = (index: Index, counts: Counts): ReadonlyArray<View> => {
  const photos = index.shoot.photos.length;
  return [
    {
      show: 'all',
      name: 'Everything',
      key: '1',
      count: counts.all,
      says:
        counts.all === photos
          ? `Every photo of the shoot: ${count(photos, 'photo')}`
          : `Every photo of the shoot: ${count(photos, 'photo')} in ${count(counts.all, 'stack')}. Photos that show the same lie in one stack.`,
    },
    {
      show: 'album',
      name: chosenName(index),
      key: '2',
      count: counts.album,
      says: index.hasAlbum
        ? 'The photos in the album, and those chosen for it'
        : 'The photos chosen for the album',
    },
    {
      show: 'left',
      name: 'Left out',
      key: '3',
      count: counts.left,
      says: 'What isn’t in the album, and why',
    },
  ];
};

const whyCount = (counts: Counts, why: Why): number =>
  why === 'weak' ? counts.weak : counts.takenOut;

const Whys = ({
  counts,
  only,
  onWhy,
}: {
  readonly counts: Counts;
  readonly only: Why | null;
  readonly onWhy: (why: Why | null) => void;
}) => (
  <ul
    aria-label="Why left out"
    className="flex shrink-0 items-center border-rule border-l pl-1.5"
  >
    {whys
      .filter((why) => whyCount(counts, why) > 0 || only === why)
      .map((why) => (
        <li key={why}>
          <button
            aria-pressed={only === why}
            className={tab}
            onClick={() => onWhy(only === why ? null : why)}
            title={
              only === why
                ? 'Show everything that was left out'
                : `Show only: ${whyTitles[why].toLowerCase()}`
            }
            type="button"
          >
            <span className="flex items-baseline gap-1.5">
              <span>{whyTitles[why]}</span>
              <span className="type-edge tabular">{whyCount(counts, why)}</span>
            </span>
          </button>
        </li>
      ))}
  </ul>
);

export const Views = ({
  index,
  filters,
  onFilters,
}: {
  readonly index: Index;
  readonly filters: Filters;
  readonly onFilters: (change: Partial<Filters>) => void;
}) => {
  // While nothing has been chosen, nothing was left out either.
  if (index.chosen === 0 && filters.show === 'all') {
    return null;
  }
  const counts = countsOf(index, filters.day);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5">
      <ul aria-label="Which photos" className="flex shrink-0 items-center">
        {viewsOf(index, counts).map(({ show, name, key, count: n, says }) => (
          <li key={show}>
            <button
              aria-keyshortcuts={key}
              aria-pressed={filters.show === show}
              className={tab}
              onClick={() => onFilters({ show, why: null })}
              title={says}
              type="button"
            >
              <span className="flex items-baseline gap-1.5">
                <span>{name}</span>
                <span className="type-edge tabular">{n}</span>
                <span className="max-lg:hidden">
                  <Key>{key}</Key>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {filters.show === 'left' && counts.left > 0 ? (
        <Whys
          counts={counts}
          onWhy={(why) => onFilters({ why })}
          only={filters.why}
        />
      ) : null}
    </div>
  );
};
