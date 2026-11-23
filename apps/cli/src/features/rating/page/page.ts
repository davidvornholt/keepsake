/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import type { Moment, Rating as StoredRating } from '../../../shared/domain.ts';
import {
  focusCompared,
  moveFocus,
  previewOf,
  showCompared,
} from './compare.ts';
import { elements } from './elements.ts';
import { showLarge, toggleZoom, unzoom } from './large.ts';

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

/** The label of the button for no stars. */
const noStars = document.createElement('span');

const state = {
  sample: [] as ReadonlyArray<Moment>,
  ratings: new Map<string, Rating>(),
  moment: 0,
  /** The photo shown large, or null while the moment's photos are compared. */
  shown: null as number | null,
  saving: false,
  /** The photos of the next moment, held so that they appear at once. */
  ahead: [] as ReadonlyArray<HTMLImageElement>,
};

const currentMoment = () => state.sample[state.moment];

const questionAbout = (moment: Moment | undefined) => {
  if (moment === undefined) {
    return `All ${state.sample.length} are rated. You can close this page.`;
  }
  const count = moment.photos.length;
  if (state.shown === null) {
    return `Which of these ${count} photos is best?`;
  }
  return count === 1
    ? 'How good is this photo?'
    : `Photo ${state.shown + 1} of ${count} is best. How good is it?`;
};

const showAnswers = (moment: Moment) => {
  const stars = state.ratings.get(moment.id)?.stars;
  const isLarge = state.shown !== null;
  for (const [index, button] of [...elements.stars.children].entries()) {
    if (button instanceof HTMLButtonElement) {
      button.hidden = !isLarge && index > 0;
      button.ariaPressed = String(index === stars);
    }
  }
  noStars.textContent = isLarge ? labels[0] : 'none of them';
  const hasMore = moment.photos.length > 1;
  elements.all.hidden = !(isLarge && hasMore);
  elements.allLabel.textContent = `All ${moment.photos.length} photos`;
  elements.zoom.hidden = !isLarge;
  elements.before.hidden = !hasMore;
  elements.after.hidden = !hasMore;
};

const show = () => {
  const moment = currentMoment();
  elements.question.textContent = questionAbout(moment);
  elements.notice.textContent = '';
  elements.rated.max = state.sample.length;
  elements.rated.value = state.ratings.size;
  elements.count.textContent = `${Math.min(state.moment + 1, state.sample.length)} of ${state.sample.length}`;
  elements.back.hidden = state.moment === 0;
  elements.compare.hidden = moment === undefined || state.shown !== null;
  elements.large.hidden = moment === undefined || state.shown === null;
  elements.answers.hidden = moment === undefined;
  if (moment === undefined) {
    return;
  }
  showAnswers(moment);
  if (state.shown === null) {
    showCompared({
      photos: moment.photos,
      best: state.ratings.get(moment.id)?.best ?? null,
      choose: (index) => showPhoto(index),
    });
  } else {
    showLarge(
      moment.photos[state.shown] ?? '',
      `Photo ${state.shown + 1} of ${moment.photos.length}`,
    );
  }
};

/** Shows a photo large, to be rated as the best of its moment. */
const showPhoto = (index: number) => {
  unzoom();
  state.shown = index;
  show();
  elements.question.focus();
};

const compareAgain = () => {
  const before = state.shown;
  if (before !== null && (currentMoment()?.photos.length ?? 0) > 1) {
    state.shown = null;
    show();
    focusCompared(before);
  }
};

const turnOver = (step: number) => {
  const count = currentMoment()?.photos.length ?? 0;
  if (state.shown !== null && count > 1) {
    state.shown = (state.shown + step + count) % count;
    show();
  }
};

const loadAhead = () => {
  const next = state.sample[state.moment + 1];
  state.ahead = (next?.photos ?? []).map((id) => {
    const picture = new Image();
    picture.src = previewOf(id);
    return picture;
  });
};

const goTo = (index: number) => {
  state.moment = Math.min(Math.max(index, 0), state.sample.length);
  const moment = currentMoment();
  const best = state.ratings.get(moment?.id ?? '')?.best ?? null;
  const chosen = best === null ? -1 : (moment?.photos.indexOf(best) ?? -1);
  if (chosen === -1) {
    state.shown = moment?.photos.length === 1 ? 0 : null;
  } else {
    state.shown = chosen;
  }
  unzoom();
  show();
  elements.question.focus();
  loadAhead();
};

/** Goes on after a moment, or back to one that was skipped. */
const goOn = () => {
  const next = state.moment + 1;
  const skipped = state.sample.findIndex(({ id }) => !state.ratings.has(id));
  goTo(next < state.sample.length || skipped === -1 ? next : skipped);
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

const rate = async (stars: number) => {
  const moment = currentMoment();
  // Stars are for the photo shown; of several, one is chosen first.
  const isAnswer = state.shown !== null || stars === 0;
  if (moment === undefined || state.saving || !isAnswer) {
    return;
  }
  const best =
    stars === 0 || state.shown === null
      ? null
      : (moment.photos[state.shown] ?? null);
  const rating: Rating = { moment: moment.id, best, stars };
  state.saving = true;
  const problem = await save(rating);
  state.saving = false;
  if (problem !== undefined) {
    elements.notice.textContent = problem;
    return;
  }
  state.ratings.set(moment.id, rating);
  goOn();
};

/** What the keys do, depending on whether one photo is shown or several. */
const actionsNow = (): ReadonlyMap<string, () => unknown> => {
  const always = [
    ['Backspace', () => goTo(state.moment - 1)],
    ...labels.map((_, stars) => [String(stars), () => rate(stars)] as const),
  ] as const;
  return new Map<string, () => unknown>(
    state.shown === null
      ? [
          ...always,
          ['ArrowLeft', () => moveFocus(-1, 0)],
          ['ArrowRight', () => moveFocus(1, 0)],
          ['ArrowUp', () => moveFocus(0, -1)],
          ['ArrowDown', () => moveFocus(0, 1)],
        ]
      : [
          ...always,
          ['ArrowLeft', () => turnOver(-1)],
          ['ArrowRight', () => turnOver(1)],
          ['Escape', compareAgain],
          ['z', toggleZoom],
        ],
  );
};

const onKey = async (event: KeyboardEvent) => {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  // A key held down rates one moment, not the next ones too.
  if (event.repeat && starKey.test(event.key)) {
    return;
  }
  const action =
    currentMoment() === undefined && event.key !== 'Backspace'
      ? undefined
      : actionsNow().get(event.key);
  if (action !== undefined) {
    event.preventDefault();
    await action();
  }
};

const textIn = (tag: string, text: string) => {
  const part = document.createElement(tag);
  part.textContent = text;
  return part;
};

const starButton = (label: string, stars: number) => {
  const button = document.createElement('button');
  button.type = 'button';
  const key = textIn('kbd', String(stars));
  key.ariaHidden = 'true';
  if (stars === 0) {
    button.append(key, noStars);
  } else {
    const drawn = textIn('span', '★'.repeat(stars));
    drawn.role = 'img';
    drawn.ariaLabel = stars === 1 ? '1 star' : `${stars} stars`;
    button.append(key, drawn, textIn('span', label));
  }
  button.addEventListener('click', () => rate(stars));
  return button;
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
  elements.stars.replaceChildren(...labels.map(starButton));
  elements.back.addEventListener('click', () => goTo(state.moment - 1));
  elements.all.addEventListener('click', compareAgain);
  elements.before.addEventListener('click', () => turnOver(-1));
  elements.after.addEventListener('click', () => turnOver(1));
  document.addEventListener('keydown', onKey);
  const next = state.sample.findIndex(({ id }) => !state.ratings.has(id));
  goTo(next === -1 ? state.sample.length : next);
};

await start();
