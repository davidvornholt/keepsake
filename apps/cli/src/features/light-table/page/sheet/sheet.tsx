import {
  type RefObject,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Filters } from '../app/route.ts';
import type { Index } from '../data/derive.ts';
import { contentOf, type Heading, headingsOf } from './content.ts';
import { type Engine, makeEngine } from './engine.ts';
import { listenToTable } from './input.ts';
import { keptZoom, openingZoom } from './sizes.ts';
import { stayingAnchor } from './steer.ts';
import { frameLimits, type Table, topOf } from './table.ts';

// The table itself: two canvases for the frames and what is drawn on them,
// and the headings of the sheets, which follow the paper.

type Props = {
  readonly index: Index;
  readonly filters: Filters;
  readonly workedOn: ReadonlySet<string>;
  /** The room the bars of the page take at the top, and what they keep of it. */
  readonly top: number;
  readonly pinned: number;
  /** The room something that floats over the foot of the table takes. */
  readonly foot: number;
  readonly engineRef: RefObject<Engine | null>;
  readonly onOpen: (id: string) => void;
  readonly onDay: (day: string | null) => void;
  readonly onZoom: () => void;
  /** Called after each frame, for whatever else follows the table. */
  readonly onFrame: (table: Table) => void;
  /** What the frame the keyboard is on is, said in words. */
  readonly cursorLabel: string;
  readonly cursorRef: RefObject<HTMLButtonElement | null>;
  /** Called when the keyboard comes to the table. */
  readonly onCursor: () => void;
};

/** Moves each heading to its sheet of paper; it stays in sight while its sheet is. */
const placeHeadings = (
  table: Table,
  headings: ReadonlyMap<string, HTMLElement>,
) => {
  const { head } = table.layout.measure;
  const scroll = table.scroller.value;
  const ceiling = topOf(table);
  for (const [key, element] of headings) {
    const paper = table.papers.get(key);
    if (paper === undefined) {
      element.style.visibility = 'hidden';
    } else {
      const top = paper.y.value - scroll;
      const lowest = top + paper.h.value - head;
      const y = Math.min(Math.max(top, ceiling), lowest);
      element.style.visibility = 'visible';
      element.style.width = `${paper.w.value}px`;
      element.style.transform = `translate3d(${paper.x.value}px, ${y}px, 0)`;
      element.style.opacity = String(paper.alpha.value * table.lights.value);
      element.dataset.stuck = String(top < ceiling);
    }
  }
};

const useEngine = (
  props: Props,
  headingsRef: RefObject<Map<string, HTMLElement>>,
) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [isUnsupported, setIsUnsupported] = useState(false);
  const onOpen = useEffectEvent(props.onOpen);
  const onZoom = useEffectEvent(props.onZoom);
  const onFrame = useEffectEvent((table: Table) => {
    placeHeadings(table, headingsRef.current);
    props.onFrame(table);
  });
  const roomOf = useEffectEvent(() => ({
    top: props.top,
    pinned: props.pinned,
    foot: props.foot,
  }));
  const sharedRef = props.engineRef;

  useEffect(() => {
    const element = containerRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (element === null || canvas === null || overlay === null) {
      return;
    }
    const engine = makeEngine(canvas, overlay, { onFrame });
    if (engine === null) {
      setIsUnsupported(true);
      return;
    }
    sharedRef.current = engine;
    const stop = listenToTable(element, engine, { onOpen, onZoom });
    const measure = () =>
      engine.setSize({
        width: element.clientWidth,
        height: element.clientHeight,
        ...roomOf(),
      });
    // The size is known before the first frames are laid out.
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // The print on the frames is drawn anew once its letters have arrived.
    document.fonts.ready.then(engine.request);
    return () => {
      stop();
      observer.disconnect();
      engine.stop();
      sharedRef.current = null;
    };
  }, [sharedRef]);

  return { containerRef, canvasRef, overlayRef, isUnsupported };
};

const HeadingButton = ({
  heading,
  isOnlyDay,
  onDay,
  register,
}: {
  readonly heading: Heading;
  readonly isOnlyDay: boolean;
  readonly onDay: (day: string | null) => void;
  readonly register: (key: string, element: HTMLElement | null) => void;
}) => {
  const text = (
    <>
      <span className="type-name shrink-0 text-[0.8125rem] text-print">
        {heading.title}
      </span>
      {/* What doesn't fit on the line is left out whole, never cut. */}
      <span className="type-edge flex h-[1lh] min-w-0 flex-wrap gap-x-3 overflow-hidden text-quiet">
        {heading.print.map((part) => (
          <span className="whitespace-nowrap" key={part}>
            {part}
          </span>
        ))}
      </span>
    </>
  );
  const className =
    'absolute top-0 left-0 flex h-[26px] items-baseline gap-x-3 px-2.5 pt-[6px] text-left will-change-transform data-[stuck=true]:bg-sheet';
  return heading.day === null ? (
    <h2 className={className} ref={(element) => register(heading.key, element)}>
      {text}
    </h2>
  ) : (
    <h2 className="contents">
      <button
        aria-pressed={isOnlyDay}
        className={`${className} hover:[&>span:first-child]:text-lamp`}
        onClick={() => onDay(isOnlyDay ? null : heading.day)}
        ref={(element) => register(heading.key, element)}
        title={isOnlyDay ? 'Show all days' : 'Show only this day'}
        type="button"
      >
        {text}
      </button>
    </h2>
  );
};

export const Sheet = (props: Props) => {
  const { index, filters, workedOn, top, pinned, foot } = props;
  const headingsRef = useRef(new Map<string, HTMLElement>());
  const { containerRef, canvasRef, overlayRef, isUnsupported } = useEngine(
    props,
    headingsRef,
  );
  const headings = useMemo(() => headingsOf(index, filters), [index, filters]);
  const shownRef = useRef<Filters | null>(null);

  useEffect(() => {
    const engine = props.engineRef.current;
    if (engine === null) {
      return;
    }
    const before = shownRef.current;
    const content = contentOf(index, filters, workedOn);
    const { show } = filters;
    shownRef.current = filters;
    engine.setContent(
      content,
      before === filters ? null : stayingAnchor(engine, content),
      before?.show === show
        ? null
        : (table) =>
            openingZoom(show, keptZoom(show), table.size, frameLimits(table)),
    );
  }, [index, filters, workedOn, props.engineRef]);

  useEffect(() => {
    const engine = props.engineRef.current;
    const element = containerRef.current;
    if (engine !== null && element !== null) {
      engine.setSize({
        width: element.clientWidth,
        height: element.clientHeight,
        top,
        pinned,
        foot,
      });
    }
  }, [top, pinned, foot, props.engineRef, containerRef]);

  const register = (key: string, element: HTMLElement | null) => {
    if (element === null) {
      headingsRef.current.delete(key);
    } else {
      headingsRef.current.set(key, element);
    }
  };

  return (
    <div
      className="absolute inset-0 touch-none select-none overflow-hidden"
      ref={containerRef}
    >
      <span aria-hidden="true">
        <canvas className="absolute inset-0 size-full" ref={canvasRef} />
        <canvas className="absolute inset-0 size-full" ref={overlayRef} />
      </span>
      <button
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Enter"
        className="sr-only"
        onBlur={() => {
          const engine = props.engineRef.current;
          if (engine !== null) {
            engine.state.isCursorShown = false;
            engine.request();
          }
        }}
        onClick={() => {
          const id = props.engineRef.current?.state.cursor ?? null;
          if (id !== null) {
            props.onOpen(id);
          }
        }}
        onFocus={(event) => {
          if (event.target.matches(':focus-visible')) {
            props.onCursor();
          }
        }}
        ref={props.cursorRef}
        type="button"
      >
        {props.cursorLabel}
      </button>
      {isUnsupported ? (
        <p className="absolute inset-0 grid place-items-center text-quiet">
          This browser can't draw the table. It needs WebGL 2.
        </p>
      ) : null}
      {(isUnsupported ? [] : headings).map((heading) => (
        <HeadingButton
          heading={heading}
          isOnlyDay={filters.day !== null && filters.day === heading.day}
          key={heading.key}
          onDay={props.onDay}
          register={register}
        />
      ))}
    </div>
  );
};
