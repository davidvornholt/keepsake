import { useEffect, useEffectEvent } from 'react';

// Keys that work wherever the owner is on the page, except while they type.

const isTypingIn = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLInputElement);

/** Whether a key presses the thing the keyboard is on, which then is all it does. */
const presses = (target: EventTarget | null, name: string): boolean =>
  (name === 'Enter' || name === 'Space') &&
  target instanceof HTMLElement &&
  target.closest('button, a[href], summary') !== null;

const zoomKeys = '+-=';

/** A letter or number held down does its thing once; arrows and zooming go on. */
const repeatsInVain = (event: KeyboardEvent): boolean =>
  event.repeat && event.key.length === 1 && !zoomKeys.includes(event.key);

/** The name of a key with what is held down beside it: "ctrl+z", "shift+ArrowLeft". */
export const nameOf = (
  event: Pick<
    KeyboardEvent,
    'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
  >,
): string => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const held = [
    event.ctrlKey || event.metaKey ? 'ctrl+' : '',
    event.altKey ? 'alt+' : '',
    event.shiftKey && event.key.length > 1 ? 'shift+' : '',
  ].join('');
  return `${held}${key === ' ' ? 'Space' : key}`;
};

/** What each key does: its name as `nameOf` gives it, and what happens. */
export type Keys = ReadonlyArray<readonly [string, (() => void) | undefined]>;

const actOf = (keys: Keys, name: string) =>
  keys.find(([key]) => key === name)?.[1];

const noKeys: Keys = [];

/**
 * Listens to the keyboard for as long as something is shown. While the owner
 * types, only what is in `whileTyping` is listened to.
 */
export const useKeys = (keys: Keys, whileTyping: Keys = noKeys): void => {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return;
    }
    const name = nameOf(event);
    if (presses(event.target, name) || repeatsInVain(event)) {
      return;
    }
    const act = actOf(isTypingIn(event.target) ? whileTyping : keys, name);
    if (act !== undefined) {
      event.preventDefault();
      act();
    }
  });
  useEffect(() => {
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, []);
};
