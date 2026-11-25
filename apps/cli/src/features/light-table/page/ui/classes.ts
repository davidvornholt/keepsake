// The few kinds of button the page has. Everything that can be pressed is
// plain type on the table; nothing is a pill or a card.

/** What all quiet buttons share: grey type that lights up. */
export const quietButton =
  'type-label inline-flex items-center gap-2 text-quiet transition-colors duration-150 hover:text-lamp disabled:text-rule disabled:hover:text-rule aria-pressed:text-lamp';

/** A button that is the next thing to do. */
export const mainButton =
  'type-label inline-flex h-10 items-center gap-2.5 bg-lamp px-4 text-sheet transition-transform duration-100 active:translate-y-px disabled:bg-rule disabled:text-table';

/** A button beside the main one. */
export const sideButton =
  'type-label inline-flex h-10 items-center gap-2.5 border border-rule px-4 text-print transition-colors duration-150 hover:border-quiet hover:text-lamp active:translate-y-px';

/** A button that leads to what an agent did, in its blue pencil. */
export const agentButton =
  'type-label inline-flex h-10 items-center gap-2.5 border border-pencil-blue px-4 text-pencil-blue transition-colors duration-150 hover:bg-pencil-blue hover:text-sheet active:translate-y-px';

/** A square button that holds one icon. */
export const iconButton =
  'inline-grid size-10 shrink-0 place-items-center text-quiet transition-colors duration-150 hover:bg-raised hover:text-lamp disabled:text-rule disabled:hover:bg-transparent';

/**
 * What surrounds a photo that is looked at. It comes and goes with the lights
 * of the table, and makes way while the photo is pulled back to it.
 */
export const chrome =
  'transition-[opacity,transform,inset-inline-end] duration-[260ms] ease-out in-data-[shown=false]:pointer-events-none in-data-[shown=false]:opacity-0 in-data-[pulled=true]:pointer-events-none in-data-[pulled=true]:opacity-0 motion-reduce:duration-[1ms]';

/** One of a few choices in a row. The chosen one is lit, with a line under it. */
export const tab =
  'type-label relative h-10 whitespace-nowrap px-2.5 text-quiet text-sm transition-colors duration-150 after:absolute after:inset-x-2.5 after:bottom-1.5 after:h-0.5 after:origin-left after:scale-x-0 after:bg-lamp after:transition-transform after:duration-200 hover:text-lamp aria-pressed:text-lamp aria-pressed:after:scale-x-100';

/** A line to type in. */
export const field =
  'h-11 w-full min-w-0 border border-rule bg-transparent px-3.5 text-[1.0625rem] text-lamp transition-colors duration-150 placeholder:text-quiet hover:border-quiet focus-visible:border-lamp';
