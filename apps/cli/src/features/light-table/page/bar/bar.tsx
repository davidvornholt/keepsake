import type { RefObject } from 'react';
import { type Filters, type Place, withFilters } from '../app/route.ts';
import { go } from '../app/router.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { AlbumLink, Attention } from './attention.tsx';
import { Days } from './days.tsx';
import { FilterChoices } from './filters.tsx';
import { Title } from './title.tsx';
import { Views } from './views.tsx';
import { Zoom } from './zoom.tsx';

// The bar above the table. Its upper part says what the shoot is and makes
// way once the table is scrolled; what chooses the photos on the table and
// what wants attention stays.

export const Bar = ({
  sheet,
  barRef,
  pinnedRef,
  rangeRef,
  hasAttention,
  onZoom,
  onStep,
}: {
  readonly sheet: Place;
  readonly barRef: RefObject<HTMLElement | null>;
  /** The part that stays once the table is scrolled. */
  readonly pinnedRef: RefObject<HTMLDivElement | null>;
  readonly rangeRef: RefObject<HTMLInputElement | null>;
  /** Whether there is room in the bar for what wants attention. */
  readonly hasAttention: boolean;
  readonly onZoom: (share: number) => void;
  readonly onStep: (direction: -1 | 1) => void;
}) => {
  const { index, filters } = useShootContext();
  const change = (next: Partial<Filters>) => go(withFilters(sheet, next));
  return (
    <header
      className="absolute inset-x-0 top-0 z-10 bg-table in-data-[away=true]:opacity-0 transition-opacity duration-200 will-change-transform"
      ref={barRef}
    >
      <div className="flex flex-wrap items-center gap-x-4 px-1.5 pt-1.5 sm:px-3">
        <Title index={index} />
        <Days
          index={index}
          onDay={(day) => change({ day })}
          only={filters.day}
        />
        <Zoom onStep={onStep} onZoom={onZoom} rangeRef={rangeRef} />
        <AlbumLink />
      </div>
      <div
        className="flex flex-wrap items-center gap-x-4 px-2 pb-1 sm:px-3.5"
        ref={pinnedRef}
      >
        <Views
          filters={filters}
          index={index}
          onShow={(show) => change({ show, why: null })}
        />
        <FilterChoices filters={filters} index={index} onFilters={change} />
        {hasAttention ? (
          <Attention className="ml-auto justify-end" sheet={sheet} />
        ) : null}
      </div>
    </header>
  );
};
