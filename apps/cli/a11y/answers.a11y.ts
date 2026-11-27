import { expect, test } from '@playwright/test';
import { cutOff, large, lay, pressed, scan, shelf, title } from './page.ts';

// What comes back to the table: what is new to look at, such as answers to
// marks and what waits for the owner, and moments the owner is asked to
// rate. One after the other, since what the last tests do with them is what
// the first ones look at.

test.describe.configure({ mode: 'default' });

const beforeName = /^Before/u;
const seenName = /^Seen/u;
const usageLimit = /Claude Code reached its usage limit/u;
const portoWaits = /\/porto\/(?:hand-over|news)/u;
const bestOfFour = 'Which of these 4 photos is best?';
const secondIsBest = 'Photo 2 of 4 is best. How good is it?';
const thirdIsBest = 'Photo 3 of 4 is best. How good is it?';
const bestOfTwo = 'Which of these 2 photos is best?';

test('compares an answer with what was there before', async ({ page }) => {
  await page.goto('/porto/news');
  await expect(page.getByText('New 1 of 3')).toBeVisible();
  await expect(page.getByRole('button', { name: beforeName })).toBeVisible();
  await page.keyboard.press('v');
  await expect(pressed(page, 'Earlier 2')).toBeVisible();
  await scan(page);
});

test('goes through what is new, oldest first', async ({ page }) => {
  await lay(page, '/porto', 'Porto');
  await page.getByRole('button', { name: '3 new things' }).click();
  await expect(page.getByText('New 1 of 3')).toBeVisible();
  await expect(large(page).getByText('Done').first()).toBeVisible();
  await scan(page);
  await page.keyboard.press('Enter');
  await expect(page.getByText('New 2 of 3')).toBeVisible();
  await expect(large(page).getByText('Not done').first()).toBeVisible();
  expect(await cutOff(page)).toEqual([]);
  await scan(page);
  // Moving on counts it as seen, as Seen does.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('New 3 of 3')).toBeVisible();
  await expect(large(page).getByText('Waits for you').first()).toBeVisible();
  await expect(large(page).getByText(usageLimit).first()).toBeVisible();
  await expect(
    large(page).getByRole('button', { name: 'Go on' }),
  ).toBeVisible();
  await scan(page);
  await page.getByRole('button', { name: seenName }).click();
  await expect(large(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'new thing' })).toBeHidden();
  // What waits for the owner still says so, until they go on.
  await expect(
    page.getByRole('button', { name: 'Waits for you' }),
  ).toBeVisible();

  // On the start page it is still new, and the walk opens it as a whole.
  await shelf(page);
  await expect(page.getByRole('link', { name: 'Porto' })).toContainText(
    '1 new thing to look at',
  );
  await page.goto('/porto/hand-over?across');
  await expect(page.getByText(usageLimit).first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Go on' }).first(),
  ).toBeVisible();
  await scan(page);
  // Nothing else is new at Porto, so the walk goes on past it.
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(portoWaits);
});

test('shows the photos of a moment, and one of them from close', async ({
  page,
}) => {
  await page.goto('/porto/rate');
  await expect(title(page)).toHaveText(bestOfFour);
  await scan(page);

  // Stars wait until a photo is chosen.
  await page.keyboard.press('3');
  await expect(title(page)).toHaveText(bestOfFour);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('k');
  await expect(pressed(page, 'Keep too: Photo 2 of 4')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(title(page)).toHaveText(secondIsBest);
  await page.keyboard.press('ArrowRight');
  await expect(title(page)).toHaveText(thirdIsBest);
  await page.keyboard.press('z');
  await scan(page);
  await page.keyboard.press('z');
  await page.keyboard.press('Escape');
  await expect(title(page)).toHaveText(bestOfFour);
  await expect(
    page.getByRole('button', { name: 'Photo 3 of 4', exact: true }),
  ).toBeFocused();
});

test('rates the moments that were asked about', async ({ page }) => {
  await page.goto('/porto/rate');
  await expect(title(page)).toHaveText(bestOfFour);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('k');
  await page.keyboard.press('Enter');
  await expect(title(page)).toHaveText(secondIsBest);
  await scan(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('4');
  await expect(title(page)).toHaveText(bestOfTwo);

  await page.keyboard.press('Backspace');
  await expect(title(page)).toHaveText(thirdIsBest);
  await expect(pressed(page, 'for the wall')).toBeVisible();
  await page.keyboard.press('4');
  await expect(title(page)).toHaveText(bestOfTwo);
  await page.keyboard.press('0');
  await expect(title(page)).toHaveText('All 3 are rated.');
  await scan(page);
  await page.keyboard.press('Enter');
  await expect(title(page)).toHaveText('Porto');
});
