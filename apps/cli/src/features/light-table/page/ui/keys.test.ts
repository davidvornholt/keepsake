import { describe, expect, it } from 'bun:test';
import { nameOf } from './keys.ts';

const nothingHeld = {
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
};

const pressed = (key: string, held: Partial<typeof nothingHeld> = {}) =>
  nameOf({ key, ...nothingHeld, ...held });

describe('nameOf', () => {
  it('names a letter the same whether shift is held or not', () => {
    expect(pressed('k')).toBe('k');
    expect(pressed('K', { shiftKey: true })).toBe('k');
    expect(pressed('+', { shiftKey: true })).toBe('+');
  });

  it('says what is held down beside a key', () => {
    expect(pressed('z', { ctrlKey: true })).toBe('ctrl+z');
    expect(pressed('z', { metaKey: true })).toBe('ctrl+z');
    expect(pressed('ArrowLeft', { shiftKey: true })).toBe('shift+ArrowLeft');
    expect(pressed('Enter', { altKey: true })).toBe('alt+Enter');
  });

  it('calls the space bar by its name', () => {
    expect(pressed(' ')).toBe('Space');
    expect(pressed('Escape')).toBe('Escape');
  });
});
