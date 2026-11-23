/// <reference lib="dom" />

import { previewOf } from './compare.ts';
import { elements } from './elements.ts';

const { photo, view, zoom } = elements;

const fullSizeOf = (id: string) => `/full?photo=${encodeURIComponent(id)}`;

const state = {
  id: '',
  zoomed: false,
  /** Where the pointer is in the view, in fractions. */
  pointer: { x: 0.5, y: 0.5 },
};

/** Shows the part of a zoomed photo that the pointer is at. */
const followPointer = () => {
  const { x, y } = state.pointer;
  view.scrollTo({
    left: x * (view.scrollWidth - view.clientWidth),
    top: y * (view.scrollHeight - view.clientHeight),
  });
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

const load = () => {
  photo.src = state.zoomed ? fullSizeOf(state.id) : previewOf(state.id);
};

const setZoomed = (zoomed: boolean) => {
  state.zoomed = zoomed;
  photo.toggleAttribute('data-zoomed', zoomed);
  zoom.ariaPressed = String(zoomed);
};

/** Shows a photo as large as the page, or at full size if it was before. */
export const showLarge = (id: string, name: string) => {
  state.id = id;
  photo.alt = name;
  load();
};

export const unzoom = () => setZoomed(false);

export const toggleZoom = () => {
  setZoomed(!state.zoomed);
  load();
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

view.addEventListener('pointermove', movePointer);
photo.addEventListener('click', toggleZoom);
photo.addEventListener('load', sizePhoto);
zoom.addEventListener('click', toggleZoom);
