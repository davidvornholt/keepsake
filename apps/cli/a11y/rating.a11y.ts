import { scanWcag22AaViolations } from '@davidvornholt/a11y-testing/axe';
import { expect, test } from '@playwright/test';

test('rates a whole shoot with the keyboard', async ({ page }) => {
  await page.goto('/');
  const progress = page.getByRole('status');
  const photo = page.locator('#photo');
  const frames = page.getByRole('listitem');
  await expect(progress).toHaveText('Moment 1 of 2, 0 rated');
  await expect(frames).toHaveCount(3);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await expect(photo).toHaveAttribute('alt', 'Frame 3 of 3');
  await expect(page.getByText('Frame 3 of 3, kept, number 2')).toBeVisible();
  expect(await scanWcag22AaViolations(page)).toEqual([]);

  await page.keyboard.press('z');
  await expect(photo).toHaveAttribute('data-zoomed', '');
  await expect(photo).toHaveAttribute('src', '/full?photo=A3');
  expect(await scanWcag22AaViolations(page)).toEqual([]);

  await page.getByRole('button', { name: '4 for the wall' }).click();
  await expect(progress).toHaveText('Moment 2 of 2, 1 rated');
  await expect(frames).toHaveCount(1);
  expect(await scanWcag22AaViolations(page)).toEqual([]);

  await page.keyboard.press('Backspace');
  await expect(page.getByText('Frame 2 of 3, best')).toBeVisible();
  await page.keyboard.press('4');
  await expect(progress).toHaveText('Moment 2 of 2, 1 rated');
  await page.keyboard.press('0');
  await expect(progress).toContainText('All 2 moments are rated');
  await expect(photo).toBeHidden();
  expect(await scanWcag22AaViolations(page)).toEqual([]);

  await page.reload();
  await expect(progress).toContainText('All 2 moments are rated');
});

test('says when a rating was not saved', async ({ page }) => {
  await page.route('**/moments', (route) =>
    route.fulfill({
      json: {
        shoot: 'lisbon',
        sample: [{ id: 'B', photos: ['B'] }],
        ratings: [],
      },
    }),
  );
  await page.route('**/ratings', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByText('Frame 1 of 1')).toBeVisible();
  await page.keyboard.press('3');
  const progress = page.getByRole('status');
  await expect(progress).toContainText('The rating was not saved');
  expect(await scanWcag22AaViolations(page)).toEqual([]);
});
