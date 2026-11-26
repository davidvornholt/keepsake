import { mobileDeviceTag } from '@davidvornholt/a11y-testing/playwright-config';
import { expect, test } from '@playwright/test';
import {
  aside,
  frame,
  large,
  marks,
  notes,
  open,
  pressed,
  scan,
  standing,
  whole,
} from './page.ts';

// A photo that is looked at, in every state a photo of the made-up albums
// has. Tests that change something each have a photo of their own, since
// they run side by side against one server.

const boxName = /^Box 1 of 1$/u;
const anyBox = /^Box \d+ of \d+$/u;
const portoMarks = /\/api\/shoots\/porto\/marks$/u;
const putIn = /^Put in/u;
const wishFor = /^Wish for the edit/u;

test('shows a finished photo whole and from close', async ({ page }) => {
  await open(page, '/lisbon/photos/D121');
  await expect(pressed(page, 'Now')).toBeVisible();
  await expect(standing(page)).toContainText('In the album');
  await expect(marks(page)).toContainText(['Change', 'Take out', 'Favorite']);
  await scan(page);

  // From close nothing lies on the photo but the way back.
  await expect(aside(page).getByLabel('Show the whole photo')).toHaveCount(1);
  await page.keyboard.press('z');
  await expect(aside(page).getByLabel('Show the whole photo')).toHaveCount(0);
  await expect(aside(page).getByRole('button', { name: 'Now' })).toHaveCount(1);
  await scan(page);
  await page.keyboard.press('Escape');
  await expect(aside(page).getByLabel('Show the whole photo')).toHaveCount(1);
  await expect(aside(page).getByRole('button', { name: 'Now' })).toHaveCount(0);
  await expect(large(page)).toBeVisible();
});

test('compares a finished photo with what it was', async ({ page }) => {
  await open(page, '/lisbon/photos/D121');
  await page.keyboard.press('b');
  await expect(pressed(page, 'Camera')).toBeVisible();
  await scan(page);
  await page.keyboard.press('v');
  await expect(pressed(page, 'Earlier 2')).toBeVisible();
  await page.keyboard.press('w');
  const divide = page.getByRole('slider', {
    name: "How much of the camera's picture shows",
  });
  await expect(divide).toBeVisible();
  await scan(page);
  await page.keyboard.press('w');
  await expect(divide).toBeHidden();
});

test('shows what is known about a photo, and the others of its stack', async ({
  page,
}) => {
  await open(page, '/lisbon/photos/D121');
  const about = page.getByRole('complementary', { name: 'About this photo' });
  await page.keyboard.press('i');
  await expect(notes(page)).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('i');
  await expect(standing(page)).toContainText('Score 9/10');
  await expect(
    about.getByRole('link', { name: 'Open in Immich' }),
  ).toBeVisible();
  await scan(page);

  // The other photo of its stack is one key away, and so is the next stack.
  const stack = page.getByRole('navigation', {
    name: 'Stack of 2 photos that show the same',
  });
  await expect(stack.getByRole('link')).toHaveCount(2);
  await page.keyboard.press('ArrowUp');
  await expect(large(page)).toHaveAccessibleName('Photo 25');
  await page.keyboard.press('ArrowDown');
  await expect(large(page)).toHaveAccessibleName('Photo 26');
  await page.keyboard.press('ArrowRight');
  await expect(large(page)).toHaveAccessibleName('Photo 27');
  await page.keyboard.press('ArrowLeft');
  await expect(large(page)).toHaveAccessibleName('Photo 26');
});

test('compares a photo with the one of its stack that is in the album', async ({
  page,
}) => {
  await open(page, '/lisbon/photos/D170');
  await expect(standing(page)).toContainText(
    'Behind the photo in the album. The arches are more regular in the other photo.',
  );
  await expect(marks(page)).toContainText([
    'Use this one instead',
    'Put in as well',
  ]);
  await scan(page);
  // From close the two are compared spot by spot, each in its half.
  await page.keyboard.press('z');
  await expect(aside(page).getByLabel('Mark this photo')).toHaveCount(1);
  await scan(page);
  await whole(page).click();
  await expect(aside(page).getByLabel('Mark this photo')).toHaveCount(0);
});

test('says in plain sight why a photo is not in the album', async ({
  page,
}) => {
  // Not strong enough, and taken out by the owner.
  await open(page, '/lisbon/photos/D70');
  await expect(standing(page)).toContainText('Left out: not strong enough');
  await expect(standing(page)).toContainText('The line leads the eye out');
  await expect(marks(page)).toContainText(['Put in']);
  await scan(page);
  await open(page, '/lisbon/photos/D91');
  await expect(standing(page)).toContainText('Taken out by you');
  await expect(standing(page)).toContainText('There is another gull already.');
  await scan(page);
});

test('asks for a change in words', async ({ page }) => {
  await open(page, '/porto/photos/D111');
  await page.keyboard.press('c');
  const note = page.getByRole('textbox', { name: 'What should change?' });
  await expect(note).toBeFocused();
  await scan(page);
  await note.fill('Less sky.');
  await page.keyboard.press('Enter');
  const said = large(page).getByText('To be changed: Less sky.').first();
  await expect(said).toBeVisible();
  await scan(page);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(said).toBeHidden();
});

test('takes a wish with a photo that is put in', async ({ page }) => {
  await open(page, '/porto/photos/D70');
  await expect(marks(page)).toHaveText([putIn]);
  await page.keyboard.press('p');
  await expect(pressed(page, putIn)).toBeVisible();
  await page.keyboard.press('c');
  const note = page.getByRole('textbox', {
    name: 'What do you want of the edit?',
  });
  await expect(note).toBeFocused();
  // Boxes show places of an edit, and the photo may have none yet.
  await expect(large(page).locator('[data-boxes]')).toHaveCount(0);
  await scan(page);
  await note.fill('Warmer light.');
  await page.keyboard.press('Enter');
  const said = large(page).getByText('To be put in: Warmer light.').first();
  await expect(said).toBeVisible();
  await expect(pressed(page, putIn)).toBeVisible();
  await expect(pressed(page, wishFor)).toBeVisible();
  await page.keyboard.press('c');
  await page.getByRole('button', { name: 'Take back the wish' }).click();
  await expect(said).toBeHidden();
  await expect(pressed(page, putIn)).toBeVisible();
});

test('gives back a change that keepsake didn’t get', async ({ page }) => {
  // Saving fails only once another photo is shown.
  const shown = Promise.withResolvers<void>();
  await page.route(portoMarks, async (route) => {
    await shown.promise;
    await route.abort();
  });
  await open(page, '/porto/photos/D84');
  await page.keyboard.press('c');
  const note = page.getByRole('textbox', { name: 'What should change?' });
  await expect(note).toBeFocused();
  const photo = await large(page).locator('[data-boxes]').boundingBox();
  const { x = 0, y = 0, width = 0, height = 0 } = photo ?? {};
  await page.mouse.move(x + width * 0.3, y + height * 0.3);
  await page.mouse.down();
  await page.mouse.move(x + width * 0.6, y + height * 0.6, { steps: 4 });
  await page.mouse.up();
  const boxes = page.getByRole('button', { name: anyBox });
  const drawn = await boxes.count();
  await note.fill('Less sky.');
  await note.press('Enter');
  await expect(note).toBeHidden();
  const first = await large(page).getAttribute('aria-label');
  await page.keyboard.press('ArrowRight');
  await expect(large(page)).not.toHaveAccessibleName(first ?? '');
  const failed = page.waitForEvent('requestfailed');
  shown.resolve();
  await failed;

  // Back on the table, a change of the photo before is asked for again. It
  // had one keepsake got before, which the lost one was to replace.
  await page.keyboard.press('Escape');
  await expect(frame(page)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('c');
  await expect(note).toHaveValue('Less sky.');
  await expect(boxes).toHaveCount(drawn);
});

test('gives back a wish that keepsake didn’t get with its put-in', async ({
  page,
}) => {
  // Saving fails until both the put-in and the wish were sent.
  const sent = Promise.withResolvers<void>();
  let isFailing = true;
  await page.route(portoMarks, async (route) => {
    if (isFailing) {
      await sent.promise;
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await open(page, '/porto/photos/D50');
  await expect(standing(page)).toContainText('Left out');
  await expect(marks(page)).toHaveText([putIn]);
  await page.keyboard.press('p');
  await expect(pressed(page, putIn)).toBeVisible();
  await page.keyboard.press('c');
  const note = page.getByRole('textbox', {
    name: 'What do you want of the edit?',
  });
  await note.fill('Warmer light.');
  await note.press('Enter');
  await expect(note).toBeHidden();
  const failed = page.waitForEvent('requestfailed');
  sent.resolve();
  await failed;

  // The put-in is lost too, so the wish brings the photo in again.
  await expect(pressed(page, putIn)).toBeHidden();
  await expect(note).toHaveValue('Warmer light.');
  await expect(large(page).locator('[data-boxes]')).toHaveCount(0);
  isFailing = false;
  const saved = page.waitForResponse(
    (response) => portoMarks.test(response.url()) && response.ok(),
  );
  await note.press('Enter');
  const said = large(page).getByText('To be put in: Warmer light.').first();
  await expect(said).toBeVisible();
  await expect(pressed(page, putIn)).toBeVisible();
  // Only what keepsake got is there after a reload.
  await saved;
  await page.reload();
  await expect(said).toBeVisible();
});

test('labels a photo', async ({ page }) => {
  await open(page, '/porto/photos/D121');
  await page.keyboard.press('t');
  const label = page.getByRole('textbox', { name: 'Add a label' });
  await expect(label).toBeFocused();
  await label.fill('wall');
  await page.keyboard.press('Enter');
  const remove = page.getByRole('button', { name: 'Remove the label wall' });
  await expect(remove).toBeVisible();
  await scan(page);
  await remove.click();
  await expect(remove).toBeHidden();
});

test('draws a box on a change, moves it with the keys and removes it', async ({
  page,
}) => {
  await open(page, '/porto/photos/D63');
  await page.keyboard.press('c');
  await expect(
    page.getByRole('textbox', { name: 'What should change?' }),
  ).toBeFocused();
  const photo = await large(page).locator('[data-boxes]').boundingBox();
  const { x = 0, y = 0, width = 0, height = 0 } = photo ?? {};
  await page.mouse.move(x + width * 0.3, y + height * 0.3);
  await page.mouse.down();
  await page.mouse.move(x + width * 0.6, y + height * 0.6, { steps: 4 });
  await page.mouse.up();
  const box = page.getByRole('button', { name: boxName });
  await expect(box).toHaveAttribute('aria-pressed', 'true');
  await scan(page);

  // The keyboard reaches the box by its number: arrows move it, Delete removes it.
  await box.focus();
  const before = await page.locator('[data-box="0"]').boundingBox();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  const after = await page.locator('[data-box="0"]').boundingBox();
  expect(after?.x).toBeGreaterThan(before?.x ?? 0);
  expect(after?.height).toBeGreaterThan(before?.height ?? 0);
  await expect(
    page.getByRole('button', { name: 'Remove box 1' }),
  ).toBeVisible();
  await scan(page);
  await page.keyboard.press('Delete');
  await expect(box).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(box).toHaveCount(1);
});

test('gives a photo of the album the heart of Immich', async ({ page }) => {
  await open(page, '/lisbon/photos/D63');
  await expect(marks(page)).toContainText(['Change', 'Take out', 'Favorite']);
  await page.keyboard.press('f');
  await expect(pressed(page, 'Favorite')).toBeVisible();
  await scan(page);
  await page.keyboard.press('f');
  await expect(pressed(page, 'Favorite')).toBeHidden();
  // A photo that isn't in the album has no heart to give.
  await open(page, '/lisbon/photos/D70');
  await expect(marks(page)).not.toContainText(['Favorite']);
});

test('marks a photo with a finger', {
  tag: mobileDeviceTag,
}, async ({ page, isMobile }) => {
  // The desktop runs this too, at the same time and on a photo of its own.
  await open(page, `/tomar/photos/${isMobile ? 'D31' : 'D12'}`);
  await marks(page).filter({ hasText: 'Take out' }).click();
  await expect(pressed(page, 'Take out')).toBeVisible();
  await scan(page);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(pressed(page, 'Take out')).toBeHidden();
  const about = page.getByRole('complementary', { name: 'About this photo' });
  if ((await notes(page).getAttribute('aria-expanded')) === 'false') {
    await notes(page).click();
  }
  await expect(about.getByRole('heading', { name: 'Labels' })).toBeVisible();
  await scan(page);
});
