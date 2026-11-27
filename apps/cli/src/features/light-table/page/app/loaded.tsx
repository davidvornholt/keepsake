import { type RefObject, useEffect, useMemo, useRef } from 'react';
import { Attention } from '../bar/attention.tsx';
import { Bar } from '../bar/bar.tsx';
import { type Index, markedIn, pencilOf, pileAround } from '../data/derive.ts';
import { clockOf, dayAndMonth, dayOf } from '../data/format.ts';
import type { ShootStore } from '../data/store.ts';
import type { ShootState } from '../data/store-state.ts';
import { standingOf } from '../data/words.ts';
import { HandOver } from '../flows/hand-over.tsx';
import { Making } from '../flows/making.tsx';
import { Notices } from '../flows/notices.tsx';
import { lookOf } from '../marks/kinds.ts';
import { askToCompose } from '../photo/intent.ts';
import { PhotoView } from '../photo/photo-view.tsx';
import { stripHeight } from '../photo/room.ts';
import { Rate } from '../rate/rate.tsx';
import type { Engine } from '../sheet/engine.ts';
import { Nothing } from '../sheet/nothing.tsx';
import { Sheet } from '../sheet/sheet.tsx';
import { useLanding } from '../shoots/use-landing.ts';
import { type Keys, useKeys } from '../ui/keys.ts';
import { useHeight } from '../ui/use-height.ts';
import { useTitle } from '../ui/use-title.ts';
import { useWindowSize } from '../ui/use-window.ts';
import {
  everything,
  hrefOf,
  type Place,
  type Route,
  type Show,
  type Within,
} from './route.ts';
import { closePhoto, go, goBack } from './router.ts';
import { type InShoot, ShootContext } from './shoot-context.ts';
import { useShown } from './use-shown.ts';
import { useTable } from './use-table.ts';

// A shoot on the table, with whatever is shown over it: one photo large, the
// marks to hand over, the answers of an agent, or the photos to rate.

type Props = {
  readonly route: Within;
  readonly index: Index;
  readonly state: ShootState;
  readonly store: ShootStore;
};

const firstBarHeight = 96;
const firstPinnedHeight = 44;
/** Below this width what wants attention floats over the foot of the table. */
const narrowBelow = 640;
const noKeys: Keys = [];

/** What the keys do with a frame, and with the stack it is part of. */
const keysSaid = (inStack: boolean, isLaidOut: boolean): string => {
  if (isLaidOut) {
    return 'Enter shows it large, Space puts the stack together';
  }
  return inStack
    ? 'Enter shows it large, Space lays the stack out'
    : 'Enter shows it large';
};

/** A frame said in words, for those who don't see the table. */
const labelOf = (
  index: Index,
  cursor: string | null,
  opened: string | null,
): string => {
  const photo = cursor === null ? undefined : index.byId.get(cursor);
  if (photo === undefined) {
    return 'The photos on the table. The arrow keys go from one to the next.';
  }
  const { open } = markedIn(index, photo.id);
  const waits = index.waiting.get(photo.id);
  const { front, photos } = pileAround(index, photo);
  const isFront = front.id === photo.id && photos.length > 1;
  const isLaidOut = opened === front.id;
  return [
    `Photo ${index.numberOf.get(photo.id) ?? 0} of ${index.shoot.photos.length}`,
    `${dayAndMonth(dayOf(photo.takenAt))}, ${clockOf(photo.takenAt)}`,
    standingOf(index, photo).text,
    ...(isFront
      ? [`In front of a stack of ${photos.length} that show the same`]
      : []),
    ...(isLaidOut ? ['Its stack is laid out'] : []),
    ...(open === null ? [] : [lookOf.change.said]),
    ...(waits === undefined ? [] : [lookOf[pencilOf(waits)].said]),
    keysSaid(isFront, isLaidOut),
  ].join('. ');
};

/** The keys that lead from the table to other photos or to what lies over it. */
const keysFrom = (sheet: Place): Keys => {
  const show = (wanted: Show) => () =>
    go({ ...sheet, filters: { ...sheet.filters, show: wanted } });
  const over = (screen: Place['screen']) => () => go({ ...sheet, screen });
  return [
    ['1', show('all')],
    ['2', show('album')],
    ['3', show('left')],
    ['h', over('hand-over')],
    ['n', over('answers')],
    ['r', over('rate')],
  ];
};

/**
 * What floats over the foot of the table, which ends above it: how far an
 * album that is being made has got, and on a narrow screen, where the bar
 * has no room for it, what wants attention.
 */
const Afloat = ({
  sheet,
  isNarrow,
  floatRef,
}: {
  readonly sheet: Place;
  readonly isNarrow: boolean;
  readonly floatRef: RefObject<HTMLDivElement | null>;
}) => (
  <div
    className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center in-data-[away=true]:opacity-0 transition-opacity duration-200"
    ref={floatRef}
  >
    {isNarrow ? (
      <Attention
        className="pointer-events-auto m-3 max-w-[calc(100%-1.5rem)] flex-wrap justify-center bg-raised px-2 py-1 shadow-[0_6px_24px_var(--color-shade)]"
        sheet={sheet}
      />
    ) : null}
    <Making sheet={sheet} />
  </div>
);

/** What lies over the table when it is asked for: the hand-over and the rating. */
const Over = ({
  route,
  sheet,
  asked,
  engineRef,
}: {
  readonly route: Within;
  readonly sheet: Place;
  readonly asked: Index['shoot']['rating'];
  readonly engineRef: RefObject<Engine | null>;
}) => (
  <>
    <HandOver
      engineRef={engineRef}
      isWanted={route.screen === 'hand-over'}
      sheet={sheet}
    />
    <Rate
      asked={asked}
      engineRef={engineRef}
      isWanted={route.screen === 'rate'}
      sheet={sheet}
    />
  </>
);

const useContext = ({ route, index, state, store }: Props): InShoot => {
  const { filters, shoot } = route;
  return useMemo(() => {
    const toPhoto = (id: string): Route => ({
      screen: 'photo',
      shoot,
      photo: id,
      filters,
      isPlaced: true,
    });
    return {
      index,
      state,
      store,
      filters,
      hrefOfPhoto: (id) => hrefOf(toPhoto(id)),
      openPhoto: (id, how = 'push') => go(toPhoto(id), how),
    };
  }, [index, state, store, filters, shoot]);
};

/**
 * Goes to the table when the address names what isn't there: a photo the
 * shoot doesn't have, answers when there are none, or nothing to rate.
 */
const useTableInstead = (
  sheet: Place,
  {
    isPhotoMissing,
    hasNoAnswers,
    hasNothingToRate,
  }: {
    readonly isPhotoMissing: boolean;
    readonly hasNoAnswers: boolean;
    readonly hasNothingToRate: boolean;
  },
) => {
  useEffect(() => {
    if (isPhotoMissing || hasNoAnswers || hasNothingToRate) {
      go(sheet, 'replace');
    }
  }, [sheet, isPhotoMissing, hasNoAnswers, hasNothingToRate]);
};

export const Loaded = (props: Props) => {
  const { route, index, state, store } = props;
  const { filters, shoot } = route;
  const context = useContext(props);
  const sheet = useMemo<Place>(
    () => ({ screen: 'sheet', shoot, filters }),
    [shoot, filters],
  );
  const table = useTable({
    index,
    store,
    show: filters.show,
    onOpen: (id, isComposing = false) => {
      if (isComposing) {
        askToCompose(id);
      }
      context.openPhoto(id);
    },
  });
  const bar = useHeight<HTMLElement>(firstBarHeight);
  const pinned = useHeight<HTMLDivElement>(firstPinnedHeight);
  const afloat = useHeight<HTMLDivElement>(0);
  const isNarrow = useWindowSize().width < narrowBelow;
  const cursorRef = useRef<HTMLButtonElement>(null);
  const workedOn = useMemo(
    () => new Set(state.activity?.photos ?? []),
    [state.activity],
  );
  const { held, large, order, pile, answers } = useShown(route, index);
  const isOnTable = route.screen === 'sheet';
  useTitle(index.shoot.title);
  useLanding(shoot, index.shoot.photos, table.engineRef);

  useTableInstead(sheet, {
    isPhotoMissing: route.screen === 'photo' && large === undefined,
    hasNoAnswers: answers.isEmpty,
    hasNothingToRate: route.screen === 'rate' && index.shoot.rating === null,
  });

  useKeys(isOnTable ? [...table.keys, ...keysFrom(sheet)] : noKeys);

  return (
    <ShootContext value={context}>
      <main className="relative h-full overflow-hidden bg-table">
        <div
          className="absolute inset-0"
          data-away={!isOnTable}
          inert={!(isOnTable || held.isLeaving)}
        >
          <Sheet
            cursorLabel={labelOf(index, table.cursor, table.opened)}
            cursorRef={cursorRef}
            engineRef={table.engineRef}
            filters={filters}
            index={index}
            onCursor={table.showCursor}
            onDay={(day) => go({ ...sheet, filters: { ...filters, day } })}
            foot={afloat.height}
            onFrame={() => table.follow(bar.ref.current)}
            onOpen={(id) => context.openPhoto(id)}
            onPile={table.togglePile}
            onZoom={table.remember}
            opened={table.opened}
            pinned={Math.min(pinned.height, bar.height)}
            top={bar.height}
            workedOn={workedOn}
          />
          {pile === null && large === undefined && order.length === 0 ? (
            <Nothing
              isEmptyShoot={index.shoot.photos.length === 0}
              isGettingReady={state.preparation !== null}
              onEverything={() => go({ ...sheet, filters: everything })}
            />
          ) : null}
          <Bar
            barRef={bar.ref}
            hasAttention={!isNarrow}
            onLetGo={table.zoomLetGo}
            onStep={table.zoomBy}
            pinnedRef={pinned.ref}
            onZoom={table.zoomTo}
            rangeRef={table.rangeRef}
            sheet={sheet}
          />
          <Afloat floatRef={afloat.ref} isNarrow={isNarrow} sheet={sheet} />
        </div>
        {large === undefined ? null : (
          <PhotoView
            engineRef={table.engineRef}
            isLeaving={held.isLeaving}
            isPile={pile !== null}
            key={held.visit}
            onClose={() => (pile === null ? closePhoto(sheet) : goBack(sheet))}
            onGone={() => {
              held.letGo();
              cursorRef.current?.focus({ preventScroll: true });
            }}
            onTurn={(id) =>
              pile === null
                ? context.openPhoto(id, 'replace')
                : answers.show(id)
            }
            order={order}
            photo={large}
          />
        )}
        <Over
          asked={index.shoot.rating}
          engineRef={table.engineRef}
          route={route}
          sheet={sheet}
        />
        <Notices below={isOnTable ? bar.height : stripHeight} />
      </main>
    </ShootContext>
  );
};
