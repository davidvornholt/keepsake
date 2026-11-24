import { describe, expect, it } from 'bun:test';
import { wholePicture } from '../../shared/boxes.ts';
import { putBack } from './keep-originals.ts';
import { isBlock, picture, valueAt } from './pixels/test-pictures.ts';

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

const sign = { people: [], signs: [{ text: 'HOTEL', box }] };
const person = {
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
  signs: [],
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
      putBack(originals, photoWith(marks), edit, crop);
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
    const edits = [
      [],
      [{ text: 'A', box: { ...box, bottom: box.top + 0.05 } }],
    ].map((signs) => {
      const edit = editWith(skin);
      putBack({ ...person, signs }, photoWith(skin), edit, wholePicture);
      return edit.pixels;
    });
    expect(edits[1]).toEqual(edits[0]);
  });
});
