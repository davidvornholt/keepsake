/// <reference lib="dom" />

const element = <A extends HTMLElement>(id: string, type: new () => A): A => {
  const found = document.querySelector(`#${id}`);
  if (!(found instanceof type)) {
    throw new Error(`The page has no ${id}.`);
  }
  return found;
};

/** What index.html holds, as far as the page changes it. */
export const elements = {
  question: element('question', HTMLHeadingElement),
  notice: element('notice', HTMLOutputElement),
  rated: element('rated', HTMLProgressElement),
  count: element('count', HTMLSpanElement),
  back: element('back', HTMLButtonElement),
  main: element('main', HTMLElement),
  /** The photos of a moment next to each other. */
  compare: element('compare', HTMLOListElement),
  /** One photo, filling the page. */
  large: element('large', HTMLDivElement),
  view: element('view', HTMLDivElement),
  photo: element('photo', HTMLImageElement),
  before: element('before', HTMLButtonElement),
  after: element('after', HTMLButtonElement),
  answers: element('answers', HTMLElement),
  stars: element('stars', HTMLFieldSetElement),
  all: element('all', HTMLButtonElement),
  allLabel: element('all-label', HTMLSpanElement),
  zoom: element('zoom', HTMLButtonElement),
};
