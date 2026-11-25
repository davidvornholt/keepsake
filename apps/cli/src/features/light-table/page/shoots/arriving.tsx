import { useEffect, useRef } from 'react';
import { Img, Placed } from '../ui/placed.tsx';
import { prefersReducedMotion } from '../ui/theme.ts';
import { type Arrival, endArrival, useArrival } from './arrival.ts';

// The photos of a shoot on their way from the start to its table. They lie
// over everything until they have arrived, and take nothing of the pointer.

/** How long a photo is on its way, and how much later each next one leaves. */
const flight = 640;
const apart = 7;
const fading = 240;
/** From where on its way a photo gives way to the frame on the table. */
const landing = 0.82;
/** If the table hasn't said where they go by then, they go away. */
const patience = 9000;
const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';

const fadeOut = (element: Element, delay = 0): Animation =>
  element.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: fading,
    delay,
    easing: 'ease-out',
    fill: 'forwards',
  });

const fly = (
  element: Element,
  { flying, targets }: Arrival,
  at: number,
): Animation => {
  const one = flying[at];
  const to = one === undefined ? undefined : targets?.get(one.src);
  if (one === undefined || to === undefined || prefersReducedMotion()) {
    return fadeOut(element);
  }
  const { rect } = one;
  const there = `translate(${to.x - rect.x}px, ${to.y - rect.y}px) scale(${to.w / rect.w}, ${to.h / rect.h})`;
  return element.animate(
    [
      { transform: 'none', opacity: 1 },
      { transform: there, opacity: 1, offset: landing },
      { transform: there, opacity: 0 },
    ],
    { duration: flight, delay: at * apart, easing, fill: 'forwards' },
  );
};

export const Arriving = ({
  shoot,
}: {
  /** The shoot the page shows, if it shows one. */
  readonly shoot: string | null;
}) => {
  const arrival = useArrival();
  const tilesRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const isElsewhere = arrival !== null && arrival.shoot !== shoot;
  const hasLanded = arrival !== null && arrival.targets !== null;

  useEffect(() => {
    if (isElsewhere) {
      endArrival();
    }
  }, [isElsewhere]);

  useEffect(() => {
    if (arrival === null) {
      return;
    }
    const timer = setTimeout(endArrival, patience);
    return () => clearTimeout(timer);
  }, [arrival]);

  useEffect(() => {
    const tiles = tilesRef.current;
    const paper = paperRef.current;
    if (!hasLanded || arrival === null || tiles === null || paper === null) {
      return;
    }
    const moving = [
      fadeOut(paper),
      ...[...tiles.children].map((tile, at) => fly(tile, arrival, at)),
    ];
    Promise.allSettled(moving.map(({ finished }) => finished)).then(
      endArrival,
      endArrival,
    );
    return () => {
      for (const animation of moving) {
        animation.cancel();
      }
    };
  }, [hasLanded, arrival]);

  if (arrival === null || isElsewhere) {
    return null;
  }
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
    >
      <Placed className="bg-sheet" placedRef={paperRef} rect={arrival.paper} />
      <div ref={tilesRef}>
        {arrival.flying.map(({ src, url, rect }) => (
          <Placed
            className="origin-top-left overflow-hidden will-change-transform"
            key={src}
            rect={rect}
          >
            <Img className="size-full object-cover" isUrgent={true} src={url} />
          </Placed>
        ))}
      </div>
    </div>
  );
};
