import { ChevronDown } from 'lucide-react';
import type { Filters } from '../app/route.ts';
import type { Index } from '../data/derive.ts';

// Fewer photos on the table: only those with one label.

const iconSize = 14;
const none = '';

export const LabelChoice = ({
  index,
  filters,
  onFilters,
}: {
  readonly index: Index;
  readonly filters: Filters;
  readonly onFilters: (change: Partial<Filters>) => void;
}) =>
  index.labels.length === 0 && filters.label === null ? null : (
    <label className="type-label relative flex h-10 shrink-0 items-center text-quiet hover:text-lamp has-[option:checked:not([value=''])]:text-lamp">
      <span className="sr-only">Label</span>
      <select
        className="h-10 max-w-44 cursor-pointer appearance-none truncate bg-transparent pr-5 pl-1 text-inherit"
        onChange={({ target }) =>
          onFilters({ label: target.value === none ? null : target.value })
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
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-0"
        size={iconSize}
      />
    </label>
  );
