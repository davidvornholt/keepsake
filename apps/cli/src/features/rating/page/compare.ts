/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { elements } from './elements.ts';
import { gridFor } from './layout.ts';

const { main, compare } = elements;

/** The shape of most photos, until the first one is loaded. */
const usualShape = 1.5;

export const previewOf = (id: string) =>
  `/previews?photo=${encodeURIComponent(id)}`;

const pictures = () => [...compare.querySelectorAll('img')];
const tiles = () => [
  ...compare.querySelectorAll<HTMLButtonElement>('[data-tile]'),
];

/** Makes the photos as large as they can be with all of them in view. */
const layOut = () => {
  const loaded = pictures().filter(({ naturalHeight }) => naturalHeight > 0);
  const shape =
    loaded.length === 0
      ? usualShape
      : Math.max(
          ...loaded.map(
            ({ naturalWidth, naturalHeight }) => naturalWidth / naturalHeight,
          ),
        );
  const { columns, rows, photoWidth } = gridFor(tiles().length, shape, {
    width: main.clientWidth,
    height: main.clientHeight,
  });
  compare.style.setProperty('--columns', String(columns));
  compare.style.setProperty('--rows', String(rows));
  compare.style.setProperty('--widest', `${columns * photoWidth}px`);
};

new ResizeObserver(layOut).observe(main);

type Compared = {
  readonly photos: ReadonlyArray<string>;
  /** The one chosen earlier. */
  readonly best: string | null;
  /** Whether a photo is worth keeping next to the best one. */
  readonly isKept: (id: string) => boolean;
  readonly choose: (index: number) => void;
  readonly toggleKept: (id: string) => void;
};

/** A button that keeps a photo next to the best one. */
const keepButton = (
  id: string,
  index: number,
  { isKept, toggleKept }: Compared,
) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.toggleAttribute('data-keep', true);
  button.ariaLabel = `Keep too: photo ${index + 1}`;
  button.ariaPressed = String(isKept(id));
  button.textContent = 'Keep too';
  button.addEventListener('click', () => {
    toggleKept(id);
    button.ariaPressed = String(isKept(id));
  });
  return button;
};

/** Shows photos next to each other, each one a button that chooses it. */
export const showCompared = (compared: Compared) => {
  const { photos, best, choose } = compared;
  compare.replaceChildren(
    ...photos.map((id, index) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.toggleAttribute('data-tile', true);
      const name = `Photo ${index + 1} of ${photos.length}`;
      button.ariaLabel = id === best ? `${name}, chosen` : name;
      button.toggleAttribute('data-chosen', id === best);
      const picture = document.createElement('img');
      picture.alt = '';
      picture.addEventListener('load', layOut);
      picture.src = previewOf(id);
      button.append(picture);
      button.addEventListener('click', () => choose(index));
      item.append(button, keepButton(id, index, compared));
      return item;
    }),
  );
  layOut();
};

export const focusCompared = (index: number) => {
  tiles()[index]?.focus();
};

const focusedItem = () =>
  [...compare.children].findIndex((item) => item.matches(':focus-within'));

/** Keeps the photo that has the focus, or no longer. */
export const toggleFocused = () => {
  compare.children[focusedItem()]
    ?.querySelector<HTMLButtonElement>('[data-keep]')
    ?.click();
};

/** Moves the focus from photo to photo, by columns or by rows. */
export const moveFocus = (right: number, down: number) => {
  const all = tiles();
  const columns = Number(compare.style.getPropertyValue('--columns'));
  const focused = focusedItem();
  const next = focused === -1 ? 0 : focused + right + down * columns;
  if (next >= 0 && next < all.length) {
    focusCompared(next);
  }
};
