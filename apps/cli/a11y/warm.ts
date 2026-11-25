import {
  pictureWidths,
  type ShootList,
  type ShootView,
} from '../src/features/light-table/contract.ts';
import { urlOf } from '../src/features/light-table/page/data/pictures.ts';

// Has a server make what it keeps from then on, so that the tests that run
// first don't wait for it, all at once and beside the browsers.

const atOnce = 4;
/** The copies that lie on the tables; larger ones are made one at a time. */
const [width] = pictureWidths;

export const warm = async (server: string): Promise<void> => {
  const address = (path: string) => `${server}${path}`;
  const { shoots }: ShootList = await (
    await fetch(address('/api/shoots'))
  ).json();
  const pictures = new Set<string>();
  for (const { name } of shoots) {
    const shoot: ShootView = await (
      await fetch(address(`/api/shoots/${name}`))
    ).json();
    for (const { picture, edit } of shoot.photos) {
      pictures.add(urlOf(edit?.picture ?? picture, width));
    }
  }
  const waiting = [...pictures];
  await Promise.all(
    Array.from({ length: atOnce }, async () => {
      for (let next = waiting.pop(); next !== undefined; next = waiting.pop()) {
        await (await fetch(address(next))).arrayBuffer();
      }
    }),
  );
};
