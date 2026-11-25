import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { type Filters, type Why, whys } from '../app/route.ts';
import { type Index, whyCounts } from '../data/derive.ts';
import { whyNames } from '../sheet/content.ts';

// Fewer photos on the table: only those left out for one reason, or only
// those with one label.

const iconSize = 14;
const none = '';

const Choice = ({
  label,
  value,
  onValue,
  children,
}: {
  readonly label: string;
  readonly value: string;
  readonly onValue: (value: string) => void;
  readonly children: ReactNode;
}) => (
  <label className="type-label relative flex h-10 shrink-0 items-center text-quiet hover:text-lamp has-[option:checked:not([value=''])]:text-lamp">
    <span className="sr-only">{label}</span>
    <select
      className="h-10 max-w-44 cursor-pointer appearance-none truncate bg-transparent pr-5 pl-1 text-inherit"
      onChange={(event) => onValue(event.target.value)}
      value={value}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden="true"
      className="pointer-events-none absolute right-0"
      size={iconSize}
    />
  </label>
);

const isWhy = (value: string): value is Why =>
  (whys as ReadonlyArray<string>).includes(value);

export const FilterChoices = ({
  index,
  filters,
  onFilters,
}: {
  readonly index: Index;
  readonly filters: Filters;
  readonly onFilters: (change: Partial<Filters>) => void;
}) => {
  const counts = whyCounts(index, filters.day);
  return (
    <>
      {filters.show === 'left' ? (
        <Choice
          label="Why left out"
          onValue={(value) => onFilters({ why: isWhy(value) ? value : null })}
          value={filters.why ?? none}
        >
          <option className="bg-dark text-print" value={none}>
            Every reason
          </option>
          {whys
            .filter((why) => (counts.get(why) ?? 0) > 0)
            .map((why) => (
              <option className="bg-dark text-print" key={why} value={why}>
                {whyNames[why]} ({counts.get(why)})
              </option>
            ))}
        </Choice>
      ) : null}
      {index.labels.length === 0 && filters.label === null ? null : (
        <Choice
          label="Label"
          onValue={(value) =>
            onFilters({ label: value === none ? null : value })
          }
          value={filters.label ?? none}
        >
          <option className="bg-dark text-print" value={none}>
            Any label
          </option>
          {index.labels.map(({ label, count }) => (
            <option className="bg-dark text-print" key={label} value={label}>
              {label} ({count})
            </option>
          ))}
        </Choice>
      )}
    </>
  );
};
