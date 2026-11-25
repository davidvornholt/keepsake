import { scanWcag22AaViolations } from '@davidvornholt/a11y-testing/axe';
import { expect } from '@playwright/test';

// What the tests of the page share: how its parts are found, by what
// someone who can't see it is told.

export type Page = Parameters<typeof scanWcag22AaViolations>[0];

const photoName = /^Photo \d+$/u;
const frameName = /^(?:Photo \d+ of 43|The photos on the table)/u;

export const scan = async (page: Page) =>
  expect(await scanWcag22AaViolations(page)).toEqual([]);

/** The heading of what is on top; the table under it is inert meanwhile. */
export const title = (page: Page) => page.locator('h1:not([inert] h1)');

/** The button that stands for the frame the keyboard is on. */
export const frame = (page: Page) =>
  page.getByRole('button', { name: frameName });

export const large = (page: Page) =>
  page.getByRole('region', { name: photoName });

export const marks = (page: Page) =>
  page.getByRole('list', { name: 'Mark this photo' }).getByRole('button');

/** The button that shows and puts away what is known about a photo. */
export const notes = (page: Page) =>
  page.getByRole('button', { name: 'About this photo' });

/** The way back from close; it is there only while a photo is that large. */
export const whole = (page: Page) =>
  page.getByRole('button', { name: 'Show the whole photo' });

/** What has stepped aside and can't be reached. */
export const aside = (page: Page) => page.locator('[inert]');

export const pressed = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, pressed: true });

/** Where a photo stands and why, as it is said right below it. */
export const standing = (page: Page) => large(page).locator('[data-standing]');

const everyAlbum = /\/api\/shoots$/u;

/** Opens the shelf. The first time, the server looks at every cover for it. */
export const shelf = async (page: Page) => {
  const answer = page.waitForResponse(everyAlbum);
  await page.goto('/');
  await answer;
};

/** Opens a photo by its address and waits until the keys reach it. */
export const open = async (page: Page, path: string) => {
  await page.goto(path);
  await expect(large(page)).toBeFocused();
};

/** Opens an album and waits until its photos lie on the table. */
export const lay = async (page: Page, path: string, name: string) => {
  await page.goto(path);
  await expect(title(page)).toHaveText(name);
  await expect(frame(page)).toBeVisible();
};

/** What is said below a photo and can't be read whole. */
export const cutOff = (page: Page) =>
  large(page)
    .locator('footer p')
    .evaluateAll((lines) =>
      lines
        .filter((line) => line.scrollHeight > line.clientHeight + 1)
        .map((line) => line.textContent),
    );
