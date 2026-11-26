import { describe, expect, it, setDefaultTimeout } from 'bun:test';
import { wholePicture } from '../../shared/boxes.ts';
import type { Box } from '../../shared/domain.ts';
import { putBack } from './keep-originals.ts';
import { isBlock, picture, valueAt } from './pixels/test-pictures.ts';

/** Looking for the photo in an edit takes seconds on a slow machine. */
const slow = 30_000;
setDefaultTimeout(slow);

const size = { width: 1200, height: 800 };
/** The edit shows the scene larger and further to the side. */
const scale = 1.08;
const offset = { x: -60, y: -20 };

const place = { left: 480, top: 320, right: 640, bottom: 480 };
const box = {
  left: place.left / size.width,
  top: place.top / size.height,
  right: place.right / size.width,
  bottom: place.bottom / size.height,
};

const isInPlace = (x: number, y: number) =>
  x >= place.left && x < place.right && y >= place.top && y < place.bottom;
/** Letters or features, and what an image model made of them. */
const isMark = (x: number, y: number) => isBlock(x / 2, y / 2);
const isRedrawn = (x: number, y: number) =>
  isBlock(x / 2 + 500, y / 2 + 500) && isBlock(x / 2 + 900, y / 2 + 900)
    ? !isMark(x, y)
    : isMark(x, y);
const wall = (x: number, y: number) => (isBlock(x / 4, y / 4) ? 90 : 40);

type Marks = { readonly bright: number; readonly dark: number };

const photoWith = ({ bright, dark }: Marks) =>
  picture(size, (x, y) => {
    if (!isInPlace(x, y)) {
      return wall(x, y);
    }
    return isMark(x, y) ? bright : dark;
  });

const editWith = ({ bright, dark }: Marks) =>
  picture(size, (column, row) => {
    const x = (column - offset.x) / scale;
    const y = (row - offset.y) / scale;
    if (!isInPlace(x, y)) {
      return wall(x, y) * 1.4;
    }
    return isRedrawn(x, y) ? bright : dark;
  });

const letters: Marks = { bright: 230, dark: 30 };
const skin: Marks = { bright: 190, dark: 130 };

const nothing = {
  people: [],
  signs: [],
  bystanders: [],
  textures: [],
  gone: [],
};
const sign = { ...nothing, signs: [{ text: 'HOTEL', box }] };
const person = {
  ...nothing,
  people: [
    {
      face: box,
      outline: [
        { x: box.left, y: box.top },
        { x: box.right, y: box.top },
        { x: box.right, y: box.bottom },
        { x: box.left, y: box.bottom },
      ],
    },
  ],
};

describe('putBack', () => {
  it.each([
    { name: 'a sign', marks: letters, originals: sign },
    { name: 'a person', marks: skin, originals: person },
  ])('puts $name where the edit shows the photo', ({ marks, originals }) => {
    for (const crop of [
      wholePicture,
      { left: 0, top: 0, right: 1, bottom: 1.2 },
    ]) {
      const edit = editWith(marks);
      putBack(originals, photoWith(marks), edit, { crop });
      const values: Array<{ mark: boolean; value: number }> = [];
      // Away from the edges, which the enlargement softens.
      for (let y = place.top + 25; y < place.bottom - 20; y += 10) {
        for (let x = place.left + 25; x < place.right - 20; x += 10) {
          const column = Math.round(scale * x + offset.x);
          const row = Math.round(scale * y + offset.y);
          const value = valueAt(edit, column, row);
          values.push({ mark: isMark(x, y), value });
        }
      }
      const of = (wanted: boolean) =>
        values.filter(({ mark }) => mark === wanted).map(({ value }) => value);
      expect(Math.min(...of(true))).toBeGreaterThan(Math.max(...of(false)));
    }
  });

  it('leaves what is written on a person to the person', () => {
    const chest = {
      left: box.left + 0.05,
      top: box.top + 0.08,
      right: box.right - 0.05,
      bottom: box.bottom - 0.08,
    };
    const edits = [[], [{ text: 'A', box: chest }]].map((signs) => {
      const edit = editWith(skin);
      putBack({ ...person, signs }, photoWith(skin), edit, {
        crop: wholePicture,
      });
      return edit.pixels;
    });
    expect(edits[1]).toEqual(edits[0]);
  });

  it('brings nothing back where something was removed', () => {
    const removed = { ...box, right: (box.left + box.right) / 2 };
    const edit = editWith(letters);
    const before = editWith(letters);
    putBack({ ...sign, gone: [removed] }, photoWith(letters), edit, {
      crop: wholePicture,
    });
    const changed = (column: number) =>
      Array.from({ length: 100 }, (_, index) =>
        Math.round(scale * (place.top + 30 + index) + offset.y),
      ).filter(
        (row) => valueAt(edit, column, row) !== valueAt(before, column, row),
      ).length;
    expect(changed(Math.round(scale * (place.left + 40) + offset.x))).toBe(0);
    expect(
      changed(Math.round(scale * (place.right - 40) + offset.x)),
    ).toBeGreaterThan(0);
  });

  it('mends a fault where the edit shows it', () => {
    // The edit shows the photo further to the side, and is broken in a box.
    const shift = { x: -100, y: -40 };
    const broken = { left: 540, top: 360, right: 660, bottom: 440 };
    const isBroken = (x: number, y: number) =>
      x >= broken.left &&
      x < broken.right &&
      y >= broken.top &&
      y < broken.bottom;
    const edit = picture(size, (x, y) =>
      isBroken(x, y) ? 255 : wall(x - shift.x, y - shift.y),
    );
    const patch = {
      left: broken.left / size.width,
      top: broken.top / size.height,
      right: broken.right / size.width,
      bottom: broken.bottom / size.height,
    };
    putBack(nothing, picture(size, wall), edit, {
      crop: wholePicture,
      mending: { patches: [patch], textures: [] },
    });
    for (let y = broken.top + 10; y < broken.bottom - 10; y += 10) {
      for (let x = broken.left + 10; x < broken.right - 10; x += 10) {
        const wanted = wall(x - shift.x, y - shift.y);
        expect(Math.abs(valueAt(edit, x, y) - wanted)).toBeLessThan(10);
      }
    }
  });
});

/** A person whose face is the top of the place, and the edit in place. */
const face = { ...box, bottom: box.top + (box.bottom - box.top) / 4 };
const faceBottom = Math.round(face.bottom * size.height);
const lowerHalf = Math.round(((box.top + box.bottom) / 2) * size.height);
const redrawnSkin = (x: number, y: number) =>
  isRedrawn(x, y) ? skin.bright : skin.dark;
const stillEdit = () =>
  picture(size, (x, y) => (isInPlace(x, y) ? redrawnSkin(x, y) : wall(x, y)));
const movedTo = (x: number, y: number) => ({
  column: Math.round(scale * x + offset.x),
  row: Math.round(scale * y + offset.y),
});
const stillAt = (x: number, y: number) => ({ column: x, row: y });

describe.each([
  { name: 'shifted', edited: () => editWith(skin), shown: movedTo },
  { name: 'in place', edited: stillEdit, shown: stillAt },
])('putBack, with a person and a removal, $name', ({ edited, shown }) => {
  /** How many pixels of the place between two rows a removal leaves changed. */
  const changes = (gone: Box) => {
    const edit = edited();
    const before = edited();
    const outline = person.people[0]?.outline ?? [];
    putBack(
      { ...person, people: [{ face, outline }], gone: [gone] },
      photoWith(skin),
      edit,
      { crop: wholePicture },
    );
    return (from: number, to: number) => {
      let changed = 0;
      for (let y = from; y < to; y += 2) {
        for (let x = place.left + 30; x < place.right - 30; x += 2) {
          const { column, row } = shown(x, y);
          const isSame =
            valueAt(edit, column, row) === valueAt(before, column, row);
          changed += isSame ? 0 : 1;
        }
      }
      return changed;
    };
  };

  it('brings the person back only outside it', () => {
    const changed = changes({ ...box, top: (box.top + box.bottom) / 2 });
    expect(changed(lowerHalf + 20, place.bottom - 10)).toBe(0);
    expect(changed(place.top + 10, lowerHalf - 20)).toBeGreaterThan(0);
  });

  it('brings back only their face when it reaches it', () => {
    const changed = changes({ ...box, top: face.top });
    expect(changed(place.top + 10, faceBottom - 10)).toBeGreaterThan(0);
    expect(changed(faceBottom + 20, place.bottom - 10)).toBe(0);
  });
});
