import { scanWcag22AaViolations } from '@davidvornholt/a11y-testing/axe';
import { expect, test } from '@playwright/test';

type Page = Parameters<typeof scanWcag22AaViolations>[0];

const question = (page: Page) => page.getByRole('heading', { level: 1 });

test('rates a whole shoot with the keyboard', async ({ page }) => {
  await page.goto('/');
  await expect(question(page)).toHaveText('Which of these 3 photos is best?');
  await expect(page.getByText('1 of 2')).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(3);
  expect(await scanWcag22AaViolations(page)).toEqual([]);

  // Stars wait until a photo is chosen.
  await page.keyboard.press('3');
  await expect(question(page)).toHaveText('Which of these 3 photos is best?');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(question(page)).toHaveText(
    'Photo 2 of 3 is best. How good is it?',
  );
  await page.keyboard.press('ArrowRight');
  await expect(question(page)).toHaveText(
    'Photo 3 of 3 is best. How good is it?',
  );
  const photo = page.getByRole('img', { name: 'Photo 3 of 3' });
  await expect(photo).toBeVisible();
  expect(await scanWcag22AaViolations(page)).toEqual([]);

  await page.keyboard.press('z');
  await expect(photo).toHaveAttribute('data-zoomed', '');
  await expect(photo).toHaveAttribute('src', '/full?photo=A3');
  expect(await scanWcag22AaViolations(page)).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Photo 3 of 3' }),
  ).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await page.keyboard.press('4');
  await expect(question(page)).toHaveText('How good is this photo?');
  await expect(page.getByText('2 of 2')).toBeVisible();
  expect(await scanWcag22AaViolations(page)).toEqual([]);

  await page.keyboard.press('Backspace');
  await expect(question(page)).toHaveText(
    'Photo 2 of 3 is best. How good is it?',
  );
  await expect(
    page.getByRole('button', { name: '4 stars for the wall' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('4');
  await expect(question(page)).toHaveText('How good is this photo?');
  await page.keyboard.press('0');
  await expect(question(page)).toContainText('All 2 are rated');
  await expect(page.getByRole('contentinfo')).toBeHidden();
  expect(await scanWcag22AaViolations(page)).toEqual([]);

  await page.reload();
  await expect(question(page)).toContainText('All 2 are rated');
});

const sample = [
  { id: 'A1', photos: ['A1', 'A2'] },
  { id: 'B', photos: ['B'] },
];

const showSample = (page: Page) =>
  page.route('**/moments', (route) =>
    route.fulfill({ json: { shoot: 'lisbon', sample, ratings: [] } }),
  );

test('rates with the pointer', async ({ page }) => {
  await showSample(page);
  const answers: Array<unknown> = [];
  await page.route('**/ratings', (route) => {
    answers.push(route.request().postDataJSON());
    return route.fulfill({ status: 204 });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Photo 1 of 2' }).click();
  await page.getByRole('button', { name: 'Next photo' }).click();
  await expect(question(page)).toHaveText(
    'Photo 2 of 2 is best. How good is it?',
  );
  await page.getByRole('button', { name: 'All 2 photos' }).click();
  await page.getByRole('button', { name: 'Photo 2 of 2' }).click();
  await page.getByRole('button', { name: '5 stars best of the year' }).click();
  await expect(question(page)).toHaveText('How good is this photo?');
  await page.getByRole('button', { name: 'Go back' }).click();
  await page.getByRole('button', { name: 'All 2 photos' }).click();
  await expect(
    page.getByRole('button', { name: 'Photo 2 of 2, chosen' }),
  ).toBeFocused();
  expect(await scanWcag22AaViolations(page)).toEqual([]);
  await page.getByRole('button', { name: 'none of them' }).click();
  await page.getByRole('button', { name: 'throw away' }).click();
  await expect(question(page)).toContainText('All 2 are rated');
  expect(answers).toEqual([
    { moment: 'A1', best: 'A2', stars: 5 },
    { moment: 'A1', best: null, stars: 0 },
    { moment: 'B', best: null, stars: 0 },
  ]);
});

test('says when a rating was not saved', async ({ page }) => {
  await showSample(page);
  await page.route('**/ratings', (route) => route.abort());
  await page.goto('/');
  await expect(question(page)).toHaveText('Which of these 2 photos is best?');
  await page.keyboard.press('0');
  const notice = page.getByRole('status');
  await expect(notice).toContainText('The rating was not saved');
  await expect(question(page)).toHaveText('Which of these 2 photos is best?');
  expect(await scanWcag22AaViolations(page)).toEqual([]);
});
