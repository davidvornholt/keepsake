import { X } from 'lucide-react';
import { type RefObject, useEffect, useId, useRef, useState } from 'react';
import type { Place } from '../app/route.ts';
import { go, goBack } from '../app/router.ts';
import { useShootContext } from '../app/shoot-context.ts';
import type { Index } from '../data/derive.ts';
import { count, dollarsOf } from '../data/format.ts';
import { drawingTime } from '../marks/wax.ts';
import type { Engine } from '../sheet/engine.ts';
import { agentButton, iconButton } from '../ui/classes.ts';
import { Key } from '../ui/controls.tsx';
import { type Keys, useKeys } from '../ui/keys.ts';
import { prefersReducedMotion } from '../ui/theme.ts';
import { useLingering } from '../ui/use-lingering.ts';
import { useTitle } from '../ui/use-title.ts';
import { AgentStatus } from './agent-status.tsx';
import { HandOverFoot } from './hand-over-foot.tsx';
import { type Ledger, ledgerOf, staggerOf } from './ledger.ts';
import { LedgerRow } from './ledger-row.tsx';
import { useFlip } from './use-flip.ts';
import { useLights } from './use-lights.ts';

// The marks for an agent, as a sheet laid over the table: gone over, handed
// over, and followed while the agent works. Nothing here changes a photo.

const iconSize = 20;
/** How bright the table stays under the list. */
const lights = 0.16;
/** The agent's pencil goes down the list in about this time, in milliseconds. */
const wholeTime = 900;
const slowest = 90;
/** How long the rings are looked at before the list moves on. */
const pause = 320;

type Going = {
  readonly ids: ReadonlySet<string>;
  readonly since: number;
  readonly stagger: number;
};

/** The chosen photos that ordering the album is about. */
const pickedOf = ({ shoot }: Index): ReadonlyArray<string> =>
  shoot.photos
    .filter(({ standing }) => standing.kind === 'picked')
    .map(({ id }) => id);

/** The marks, and handing them over while the agent's pencil goes around each. */
const useLedger = () => {
  const { index, store } = useShootContext();
  const [going, setGoing] = useState<Going | null>(null);
  const [handed, setHanded] = useState<number | null>(null);
  // The marks that are going stay where they are until the pencil is done.
  const ledger = ledgerOf(index, going?.ids);
  const marks = ledger.open.length;
  return {
    ledger,
    going,
    handed,
    start: () => {
      if (going !== null || (marks === 0 && !ledger.ordersAlbum)) {
        return;
      }
      const isStill = prefersReducedMotion();
      const stagger = isStill ? 0 : staggerOf(marks, wholeTime, slowest);
      const drawn = isStill ? 0 : stagger * (marks - 1) + drawingTime + pause;
      setGoing({
        ids: new Set(ledger.open.map(({ mark }) => mark.id)),
        since: performance.now(),
        stagger,
      });
      Promise.all([
        store.handOver({
          dollars: ledger.dollars,
          marks: ledger.open.map(({ mark }) => mark.id),
          album: ledger.ordersAlbum ? pickedOf(index) : null,
        }),
        new Promise((done) => setTimeout(done, drawn)),
      ])
        .then(([many]) => {
          setGoing(null);
          setHanded(many);
        })
        .catch(() => setGoing(null));
    },
  };
};

/** A mark with its key, where there is a keyboard. */
const Named = ({
  says,
  letter,
}: {
  readonly says: string;
  readonly letter: string;
}) => (
  <>
    {says}
    <span className="hidden [@media(pointer:fine)]:inline">
      {' '}
      <Key>{letter}</Key>
    </span>
  </>
);

const titleOf = (ledger: Ledger, isOrdered: boolean): string => {
  if (ledger.ordersAlbum && ledger.isFirst) {
    return 'Order the album';
  }
  if (ledger.open.length > 0 || ledger.ordersAlbum) {
    return 'Hand over';
  }
  if (isOrdered) {
    return ledger.isFirst ? 'The album is ordered' : 'Handed over';
  }
  return ledger.waiting.length > 0 ? 'Handed over' : 'Nothing to hand over';
};

/** What an agent does with so many chosen photos, and what that costs. */
const workOf = (ledger: Ledger, chosen: number, each: string): string => {
  const into = ledger.isFirst ? 'a new album in Immich' : 'the album';
  const them = chosen === 1 ? 'it' : 'them';
  const owed = ledger.isFirst ? ledger.edits : ledger.firstEdits;
  if (owed === 0) {
    return `${chosen === 1 ? 'It is' : 'They are'} edited already, so an agent only puts ${them} into ${into}, which costs nothing.`;
  }
  const which =
    owed >= chosen
      ? `${chosen === 1 ? 'it' : 'each one'}`
      : `the ${count(owed, 'photo')} that ${owed === 1 ? 'isn’t' : 'aren’t'} edited yet`;
  return `An agent has an image model edit ${which}, which costs about ${each} a photo, and puts ${them} into ${into}.`;
};

/** What ordering the album leads to, said before it costs anything. */
const Order = ({ ledger }: { readonly ledger: Ledger }) => {
  const { index } = useShootContext();
  const each = dollarsOf(index.shoot.dollars.perEdit);
  const chosen = ledger.isFirst ? ledger.chosenAfter : ledger.picked;
  return (
    <div className="max-w-[36rem] pb-5 text-print">
      <p>
        {count(chosen, 'photo')} {chosen === 1 ? 'is' : 'are'} chosen
        {ledger.isFirst ? '' : ' and not in the album yet'}.{' '}
        {workOf(ledger, chosen, each)}
      </p>
      <p className="mt-2 text-quiet">
        Nothing is edited and nothing is spent until you press the button below,
        and never more than it says.
        {ledger.isFirst
          ? ' The photos that weren’t chosen stay where they are; you can put one in later.'
          : ''}
      </p>
    </div>
  );
};

const Lists = ({
  ledger,
  going,
}: {
  readonly ledger: Ledger;
  readonly going: Going | null;
}) => {
  const { state } = useShootContext();
  const workedOn = new Set(state.activity?.photos ?? []);
  const both = ledger.open.length > 0 && ledger.waiting.length > 0;
  return (
    <>
      {ledger.open.length === 0 ? null : (
        <section aria-label="To hand over">
          {both || ledger.ordersAlbum ? (
            <h2 className="type-edge pt-1 pb-2 text-quiet">
              {ledger.ordersAlbum && ledger.isFirst
                ? 'Your changes to the choice'
                : 'To hand over'}
            </h2>
          ) : null}
          <ul>
            {ledger.open.map((line, at) => (
              <LedgerRow
                going={
                  going?.ids.has(line.mark.id)
                    ? { since: going.since + at * going.stagger }
                    : null
                }
                isOpen={true}
                isWorkedOn={false}
                key={line.mark.id}
                line={line}
              />
            ))}
          </ul>
        </section>
      )}
      {ledger.waiting.length === 0 ? null : (
        <section aria-label="Handed over">
          {both ? (
            <h2 className="type-edge pt-6 pb-2 text-pencil-blue">
              Handed over
            </h2>
          ) : null}
          <ul>
            {ledger.waiting.map((line) => (
              <LedgerRow
                going={null}
                isOpen={false}
                isWorkedOn={workedOn.has(line.photo.id)}
                key={line.mark.id}
                line={line}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  );
};

/** What there is besides the list: answers to look at. */
const Notes = ({
  ledger,
  sheet,
}: {
  readonly ledger: Ledger;
  readonly sheet: Place;
}) =>
  ledger.news > 0 ? (
    <div className="pt-5 pb-2">
      <button
        className={agentButton}
        onClick={() => go({ ...sheet, screen: 'answers' }, 'replace')}
        type="button"
      >
        Look at {count(ledger.news, 'answer')}
      </button>
    </div>
  ) : null;

const scrolledTo = new Map<string, number>();

/** Keeps the place in the list for when the owner comes back from a photo. */
const useScrollKept = (
  listRef: RefObject<HTMLDivElement | null>,
  key: string,
) => {
  useEffect(() => {
    const list = listRef.current;
    if (list === null) {
      return;
    }
    list.scrollTop = scrolledTo.get(key) ?? 0;
    return () => {
      scrolledTo.set(key, list.scrollTop);
    };
  }, [listRef, key]);
};

/** How long the sheet takes to leave, in milliseconds, as in its classes. */
const leaves = 220;
const noKeys: Keys = [];

type Props = {
  readonly sheet: Place;
  readonly engineRef: RefObject<Engine | null>;
};

const Sheet = ({
  sheet,
  engineRef,
  isLeaving,
}: Props & {
  /** True once the owner has left, while the sheet goes away. */
  readonly isLeaving: boolean;
}) => {
  const { index, store } = useShootContext();
  const handing = useLedger();
  const { ledger } = handing;
  const titleId = useId();
  const viewRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [isShown, setIsShown] = useState(false);
  const close = () => goBack(sheet);
  useLights(engineRef, isLeaving ? null : lights);
  useFlip(listRef);
  useScrollKept(listRef, sheet.shoot);
  const title = titleOf(ledger, index.shoot.ordered !== null);
  useTitle(title, index.shoot.about ?? index.shoot.name);

  useEffect(() => {
    viewRef.current?.focus({ preventScroll: true });
    const shown = requestAnimationFrame(() => setIsShown(true));
    return () => cancelAnimationFrame(shown);
  }, []);

  const undo = () => {
    store.undo().catch(() => undefined);
  };
  // On its way out the sheet leaves the keys to the table.
  useKeys(
    isLeaving
      ? noKeys
      : [
          ['Enter', handing.start],
          ['Escape', close],
          ['u', undo],
          ['ctrl+z', undo],
        ],
  );

  return (
    <section
      aria-labelledby={titleId}
      className="absolute inset-0 z-30 flex justify-center outline-none transition-[opacity,transform] duration-300 ease-out data-[leaving=true]:pointer-events-none data-[shown=false]:translate-y-5 data-[shown=false]:opacity-0 data-[leaving=true]:duration-[220ms] motion-reduce:translate-y-0 motion-reduce:transition-none sm:py-4"
      data-leaving={isLeaving}
      data-shown={isShown && !isLeaving}
      inert={isLeaving}
      ref={viewRef}
      tabIndex={-1}
    >
      <div className="flex max-h-full w-full max-w-[46rem] flex-col self-start bg-sheet shadow-[0_18px_60px_var(--color-shade)] max-sm:min-h-full">
        <header className="flex shrink-0 items-start gap-2 px-3 pt-3 pb-4 sm:px-5">
          <div className="min-w-0 flex-1 pt-1.5 pl-2">
            <h1 className="type-name text-[1.375rem] text-lamp" id={titleId}>
              {title}
            </h1>
            <div aria-live="polite" className="mt-3 empty:hidden">
              <AgentStatus />
            </div>
          </div>
          <button
            aria-keyshortcuts="Escape"
            aria-label="Back to the table"
            className={iconButton}
            onClick={close}
            title="Back to the table"
            type="button"
          >
            <X aria-hidden="true" size={iconSize} />
          </button>
        </header>
        <div
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-7"
          ref={listRef}
        >
          {ledger.ordersAlbum ? <Order ledger={ledger} /> : null}
          <Lists going={handing.going} ledger={ledger} />
          {ledger.open.length + ledger.waiting.length === 0 &&
          !ledger.ordersAlbum &&
          index.shoot.ordered === null ? (
            <p className="max-w-[36rem] text-print">
              No photo carries a mark. Mark what you want different, and an
              agent does it:{' '}
              <span className="text-quiet">
                <Named letter="C" says="Change" />,{' '}
                <Named letter="X" says="Take out" />,{' '}
                <Named letter="P" says="Put in" /> and{' '}
                <Named letter="S" says="Use this one instead" />.
              </span>
            </p>
          ) : null}
          <Notes ledger={ledger} sheet={sheet} />
        </div>
        <HandOverFoot
          handed={handing.handed}
          isGoing={handing.going !== null}
          ledger={ledger}
          onClose={close}
          onHandOver={handing.start}
        />
      </div>
    </section>
  );
};

/** The sheet with the marks, for as long as it is wanted and while it leaves. */
export const HandOver = ({
  isWanted,
  ...props
}: Props & { readonly isWanted: boolean }) => {
  const { isThere, isLeaving } = useLingering(isWanted, leaves);
  return isThere ? <Sheet isLeaving={isLeaving} {...props} /> : null;
};
