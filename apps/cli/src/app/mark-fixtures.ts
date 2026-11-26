import { existsSync } from 'node:fs';
import { shootFile, shootJson } from './command-fixtures.ts';

/** What was spent on the shoot so far, in dollars. */
export const spentSoFar = async () =>
  existsSync(shootFile('spending.json'))
    ? Object.values(
        (await shootJson('spending.json')) as Record<
          string,
          { readonly dollars: number }
        >,
      ).reduce((sum, { dollars }) => sum + dollars, 0)
    : 0;

/** Saves what the owner handed over at once. */
export const handedOver = async (id: string, overrides: object = {}) =>
  Bun.write(
    shootFile('hand-overs', `${id}.json`),
    JSON.stringify({
      id,
      at: '2026-04-01T11:00:00Z',
      dollars: 0,
      spentBefore: await spentSoFar(),
      marks: [],
      album: null,
      fulfilledAt: null,
      ...overrides,
    }),
  );

/** Saves a mark, and hands it over unless `handedOverAt` is null. */
export const mark = async (
  id: string,
  {
    handedOverAt = '2026-04-01T11:00:00Z',
    ...overrides
  }: Record<string, unknown> = {},
) => {
  await Bun.write(
    shootFile('marks', `${id}.json`),
    JSON.stringify({
      id,
      photo: 'B',
      kind: 'change',
      note: 'Remove the chair',
      boxes: [],
      other: null,
      madeAt: '2026-04-01T10:00:00Z',
      answer: null,
      seenAt: null,
      ...overrides,
    }),
  );
  if (handedOverAt !== null) {
    await handedOver(`for-${id}`, { at: handedOverAt, marks: [id] });
  }
};
