import { expect, test } from '@playwright/test';
import { cutOff, large, lay, pressed, scan, title } from './page.ts';

// What an agent sends back to the table: answers to look at, and moments it
// asks the owner to rate.

const beforeName = /^Before/u;
const seenName = /^Seen/u;

test('goes through the answers of an agent', async ({ page }) => {
  await lay(page, '/porto', 'Porto, June 2026');
  await page.getByRole('button', { name: '2 answers' }).click();
  await expect(page.getByText('Answer 1 of 2')).toBeVisible();
  await expect(large(page).getByText('Done').first()).toBeVisible();
  await scan(page);
  await expect(page.getByRole('button', { name: beforeName })).toBeVisible();
  await page.keyboard.press('v');
  await expect(pressed(page, 'Earlier 2')).toBeVisible();
  await scan(page);
  await page.keyboard.press('Enter');
  await expect(page.getByText('Answer 2 of 2')).toBeVisible();
  await expect(large(page).getByText('Not done').first()).toBeVisible();
  expect(await cutOff(page)).toEqual([]);
  await scan(page);
  await page.getByRole('button', { name: seenName }).click();
  await expect(large(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'answers' })).toBeHidden();
});

test('rates the moments that were asked about', async ({ page }) => {
  await page.goto('/porto/rate');
  await expect(title(page)).toHaveText('Which of these 4 photos is best?');
  await scan(page);

  // Stars wait until a photo is chosen.
  await page.keyboard.press('3');
  await expect(title(page)).toHaveText('Which of these 4 photos is best?');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('k');
  await expect(pressed(page, 'Keep too: Photo 2 of 4')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(title(page)).toHaveText('Photo 2 of 4 is best. How good is it?');
  await scan(page);
  await page.keyboard.press('ArrowRight');
  await expect(title(page)).toHaveText('Photo 3 of 4 is best. How good is it?');
  await page.keyboard.press('z');
  await scan(page);
  await page.keyboard.press('z');
  await page.keyboard.press('Escape');
  await expect(title(page)).toHaveText('Which of these 4 photos is best?');
  await expect(
    page.getByRole('button', { name: 'Photo 3 of 4', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('4');
  await expect(title(page)).toHaveText('Which of these 2 photos is best?');

  await page.keyboard.press('Backspace');
  await expect(title(page)).toHaveText('Photo 3 of 4 is best. How good is it?');
  await expect(pressed(page, 'for the wall')).toBeVisible();
  await page.keyboard.press('4');
  await expect(title(page)).toHaveText('Which of these 2 photos is best?');
  await page.keyboard.press('0');
  await expect(title(page)).toHaveText('All 3 are rated.');
  await scan(page);
  await page.keyboard.press('Enter');
  await expect(title(page)).toHaveText('Porto, June 2026');
});
