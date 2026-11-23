/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import type { Moment, Rating as StoredRating } from '../../../shared/domain.ts';

type Rating = Omit<StoredRating, 'photos'>;

const labels = [
  'throw away',
  'ordinary',
  'good',
  'for the album',
  'for the wall',
  'best of the year',
] as const;

const starKey = /^\d$/u;

const element = <A extends HTMLElement>(id: string, type: new () => A): A => {
  const found = document.querySelector(`#${id}`);
  if (!(found instanceof type)) {
    throw new Error(`The page has no ${id}.`);
  }
  return found;
};

const progress = element('progress', HTMLOutputElement);
const photo = element('photo', HTMLImageElement);
const caption = element('caption', HTMLElement);
const view = element('view', HTMLElement);
const frames = element('frames', HTMLOListElement);
const starButtons = element('stars', HTMLDivElement);

const previewOf = (id: string) => `/previews?photo=${encodeURIComponent(id)}`;
const fullSizeOf = (id: string) => `/full?photo=${encodeURIComponent(id)}`;

const state = {
  sample: [] as ReadonlyArray<Moment>,
  ratings: new Map<string, Rating>(),
  moment: 0,
  frame: 0,
  best: [] as ReadonlyArray<string>,
  saving: false,
  zoomed: false,
  /** Where the pointer is in the view, in fractions. */
  pointer: { x: 0.5, y: 0.5 },
};

const currentMoment = () => state.sample[state.moment];

/** Shows the part of a zoomed photo that the pointer is at. */
const followPointer = () => {
  const { x, y } = state.pointer;
  view.scrollTo({
    left: x * (view.scrollWidth - view.clientWidth),
    top: y * (view.scrollHeight - view.clientHeight),
  });
};

const setZoomed = (zoomed: boolean) => {
  state.zoomed = zoomed;
  photo.toggleAttribute('data-zoomed', zoomed);
};

/** Fits the photo into the page, or shows each of its pixels as one. */
const sizePhoto = () => {
  if (state.zoomed) {
    photo.style.inlineSize = `${photo.naturalWidth / globalThis.devicePixelRatio}px`;
    followPointer();
  } else {
    photo.style.inlineSize = '';
  }
};

const showFrames = () => {
  const moment = currentMoment();
  if (moment === undefined) {
    return;
  }
  const { photos } = moment;
  const id = photos[state.frame] ?? '';
  photo.hidden = false;
  photo.src = state.zoomed ? fullSizeOf(id) : previewOf(id);
  photo.alt = `Frame ${state.frame + 1} of ${photos.length}`;
  const place = state.best.indexOf(id);
  caption.textContent = [
    `Frame ${state.frame + 1} of ${photos.length}`,
    ...(place === -1
      ? []
      : [place === 0 ? 'best' : `kept, number ${place + 1}`]),
  ].join(', ');
  frames.replaceChildren(
    ...photos.map((frame, index) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.ariaCurrent = String(index === state.frame);
      const image = document.createElement('img');
      image.src = previewOf(frame);
      image.alt = '';
      button.append(image);
      const kept = state.best.indexOf(frame);
      if (kept === -1) {
        button.ariaLabel = `Frame ${index + 1}`;
      } else {
        button.ariaLabel = `Frame ${index + 1}, kept, number ${kept + 1}`;
        const badge = document.createElement('span');
        badge.textContent = String(kept + 1);
        button.append(badge);
      }
      button.addEventListener('click', () => {
        state.frame = index;
        showFrames();
      });
      item.append(button);
      return item;
    }),
  );
  frames.querySelector('[aria-current="true"]')?.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
  });
};

const showMoment = () => {
  const moment = currentMoment();
  const done = state.ratings.size;
  progress.textContent =
    moment === undefined
      ? `All ${state.sample.length} moments are rated. You can close this page.`
      : `Moment ${state.moment + 1} of ${state.sample.length}, ${done} rated`;
  setZoomed(false);
  if (moment === undefined) {
    photo.hidden = true;
    photo.removeAttribute('src');
    photo.alt = '';
    caption.textContent = '';
    frames.replaceChildren();
    return;
  }
  const rating = state.ratings.get(moment.id);
  state.best = rating?.best ?? [];
  state.frame = Math.max(0, moment.photos.indexOf(state.best[0] ?? ''));
  for (const [stars, button] of [...starButtons.children].entries()) {
    button.ariaPressed = String(rating?.stars === stars);
  }
  showFrames();
};

const moveFrame = (step: number) => {
  const count = currentMoment()?.photos.length ?? 1;
  state.frame = (state.frame + step + count) % count;
  showFrames();
};

const toggleBest = () => {
  const id = currentMoment()?.photos[state.frame];
  if (id !== undefined) {
    state.best = state.best.includes(id)
      ? state.best.filter((kept) => kept !== id)
      : [...state.best, id];
    showFrames();
  }
};

const zoom = () => {
  if (currentMoment() !== undefined) {
    setZoomed(!state.zoomed);
    showFrames();
  }
};

const movePointer = (event: PointerEvent) => {
  const { left, top, width, height } = view.getBoundingClientRect();
  state.pointer = {
    x: (event.clientX - left) / width,
    y: (event.clientY - top) / height,
  };
  if (state.zoomed) {
    followPointer();
  }
};

const goTo = (moment: number) => {
  state.moment = Math.min(Math.max(moment, 0), state.sample.length);
  showMoment();
};

const save = async (rating: Rating): Promise<string | undefined> => {
  try {
    const response = await fetch('/ratings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(rating),
    });
    return response.ok
      ? undefined
      : `The rating was not saved (${response.status}). Try again.`;
  } catch {
    return 'The rating was not saved, because keepsake has stopped. Start keepsake rate again and reload this page.';
  }
};

/** Goes on after a moment, or back to one that was skipped. */
const goOn = () => {
  const isOpen = ({ id }: Moment) => !state.ratings.has(id);
  const next = state.moment + 1;
  const skipped = state.sample.findIndex(isOpen);
  goTo(next < state.sample.length || skipped === -1 ? next : skipped);
};

const rate = async (stars: number) => {
  const moment = currentMoment();
  if (moment === undefined || state.saving) {
    return;
  }
  const shown = moment.photos[state.frame];
  const chosen =
    state.best.length === 0 && shown !== undefined ? [shown] : state.best;
  const rating: Rating = {
    moment: moment.id,
    best: stars === 0 ? [] : chosen,
    stars,
  };
  state.saving = true;
  const problem = await save(rating);
  state.saving = false;
  if (problem !== undefined) {
    progress.textContent = problem;
    return;
  }
  state.ratings.set(moment.id, rating);
  goOn();
};

const onKey = async (event: KeyboardEvent) => {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  // A key held down rates one moment, not the next ones too.
  if (event.repeat && starKey.test(event.key)) {
    return;
  }
  const actions = new Map<string, () => unknown>([
    ['ArrowLeft', () => moveFrame(-1)],
    ['ArrowRight', () => moveFrame(1)],
    ['Backspace', () => goTo(state.moment - 1)],
    ['z', zoom],
    [' ', toggleBest],
    ...labels.map((_, stars) => [String(stars), () => rate(stars)] as const),
  ]);
  const action = actions.get(event.key);
  if (action !== undefined) {
    event.preventDefault();
    await action();
  }
};

const start = async () => {
  const response = await fetch('/moments');
  const answer: {
    readonly shoot: string;
    readonly sample: ReadonlyArray<Moment>;
    readonly ratings: ReadonlyArray<Rating>;
  } = await response.json();
  document.title = `Rate ${answer.shoot}`;
  state.sample = answer.sample;
  const sampled = new Set(answer.sample.map(({ id }) => id));
  state.ratings = new Map(
    answer.ratings
      .filter(({ moment }) => sampled.has(moment))
      .map((rating) => [rating.moment, rating] as const),
  );
  starButtons.replaceChildren(
    ...labels.map((label, stars) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${stars} ${label}`;
      button.addEventListener('click', () => rate(stars));
      return button;
    }),
  );
  document.addEventListener('keydown', onKey);
  view.addEventListener('pointermove', movePointer);
  photo.addEventListener('click', zoom);
  photo.addEventListener('load', sizePhoto);
  const next = state.sample.findIndex(({ id }) => !state.ratings.has(id));
  goTo(next === -1 ? state.sample.length : next);
};

await start();
