import { mobileDeviceTag } from '@davidvornholt/a11y-testing/playwright-config';
import { expect, test } from '@playwright/test';
import {
  aside,
  frame,
  large,
  lay,
  marks,
  notes,
  open,
  pressed,
  scan,
  shelf,
  standing,
  title,
  whole,
} from './page.ts';

// The light table in every state the made-up albums have. Tests that change
// something each have an album or a photo of their own, since they run side
// by side against one server.

const secondFrame = /^Photo 4 of 43/u;
const takenOutSaid = /To be taken out/u;
const stackOfFive =
  /^Photo 15 of 43.*In front of a stack of 5.*Space lays the stack out$/u;
const laidOut =
  /^Photo 15 of 43.*Its stack is laid out.*Space puts the stack together$/u;
const behindInStack = /^Photo 16 of 43.*Its stack is laid out/u;
const editName = /^Edit \d+ photos?, about \$/u;
const boxName = /^Box 1 of 1$/u;

/** A way to look at the table, with how many stacks it shows and its key. */
const viewOf = (name: string, stacks: number) =>
  new RegExp(`^${name}\\s*${stacks}\\s*\\d$`, 'u');

test('lays a published album on the table', async ({ page }) => {
  await lay(page, '/lisbon', 'Lisbon, May 2026');
  await expect(page.getByText('43 photos in 17 stacks').first()).toBeVisible();
  await expect(page.getByText('8 in the album of at most 10')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Album in Immich' }),
  ).toBeVisible();
  const days = page.getByRole('heading', { level: 2 });
  await expect(days).toHaveCount(4);
  await expect(days.first()).toContainText('5 stacks');
  await expect(days.first()).toContainText('3 in the album');
  await scan(page);

  // What is in the album and what was left out add up to everything.
  const views = page.getByRole('list', { name: 'Which photos' });
  await expect(views.getByRole('button')).toHaveText([
    viewOf('Everything', 17),
    viewOf('Album', 9),
    viewOf('Left out', 8),
  ]);
  await page.keyboard.press('3');
  await expect(pressed(page, 'Left out')).toBeVisible();
  await scan(page);
  await page.keyboard.press('2');
  await expect(pressed(page, 'Album')).toBeVisible();
  await page.getByRole('button', { name: '1 May', exact: true }).click();
  await expect(days).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Label' }).selectOption({
    label: 'calendar (1)',
  });
  await expect(page.getByText('No photos here.')).toBeVisible();
  await scan(page);
  await page.getByRole('button', { name: 'Show everything' }).click();
  await expect(days).toHaveCount(4);
});

test('shows albums that nothing is chosen for yet', async ({ page }) => {
  await lay(page, '/braga', 'Braga, July 2026');
  await expect(page.getByText('Nothing chosen yet')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Which photos' })).toBeHidden();
  await scan(page);
  await lay(page, '/evora', 'Évora, August 2026');
  await scan(page);
});

test('opens a stack on the table and closes it', async ({ page }) => {
  await lay(page, '/evora', 'Évora, August 2026');
  await frame(page).focus();
  for (const _ of [1, 2, 3, 4, 5, 6, 7]) {
    await page.keyboard.press('ArrowRight');
  }
  await expect(frame(page)).toHaveAccessibleName(stackOfFive);
  await scan(page);
  await page.keyboard.press('Space');
  await expect(frame(page)).toHaveAccessibleName(laidOut);
  await page.keyboard.press('ArrowRight');
  await expect(frame(page)).toHaveAccessibleName(behindInStack);
  await scan(page);
  await page.keyboard.press('Escape');
  await expect(frame(page)).toHaveAccessibleName(stackOfFive);
});

test('marks a frame on the table with the keyboard and takes it back', async ({
  page,
}) => {
  await lay(page, '/porto', 'Porto, June 2026');
  await frame(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect(frame(page)).toHaveAccessibleName(secondFrame);
  // A photo that isn't in the album can't be taken out: the page says what
  // can be done with it.
  await page.keyboard.press('x');
  await expect(page.getByRole('status')).toContainText('Put in (P)');
  await scan(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('x');
  await expect(frame(page)).toHaveAccessibleName(takenOutSaid);
  await scan(page);
  await page.keyboard.press('u');
  await expect(frame(page)).not.toHaveAccessibleName(takenOutSaid);
  await page.keyboard.press('Enter');
  await expect(large(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(large(page)).toBeHidden();
  await expect(frame(page)).toBeFocused();
});

test('compares a finished photo with what it was', async ({ page }) => {
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

  await page.keyboard.press('b');
  await expect(pressed(page, 'Camera')).toBeVisible();
  await scan(page);
  await page.keyboard.press('v');
  await expect(pressed(page, 'Earlier 2')).toBeVisible();
  await page.keyboard.press('w');
  await expect(
    page.getByRole('slider', {
      name: "How much of the camera's picture shows",
    }),
  ).toBeVisible();
  await scan(page);
  await page.keyboard.press('w');

  await page.keyboard.press('i');
  const about = page.getByRole('complementary', { name: 'About this photo' });
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

test('says in plain sight why a photo is not in the album', async ({
  page,
}) => {
  // Behind the photo of its stack that is in the album.
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

test('asks for a change in words and labels the photo', async ({ page }) => {
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

test('hands marks over to an agent that is started for them', async ({
  page,
}) => {
  await open(page, '/lisbon/photos/D111');
  await page.keyboard.press('x');
  await expect(pressed(page, 'Take out')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(large(page)).toBeHidden();
  await page.keyboard.press('h');
  await expect(title(page)).toHaveText('Hand over');
  const handing = page.getByRole('region', { name: 'Hand over', exact: true });
  const takeBack = page
    .getByRole('region', { name: 'To hand over' })
    .getByRole('button', { name: 'Take back: To be taken out, photo 24' });
  await expect(takeBack).toBeVisible();
  await expect(handing).toContainText('An agent is started for it');
  await scan(page);

  await takeBack.click();
  await expect(takeBack).toBeHidden();
  await page.keyboard.press('u');
  await expect(takeBack).toBeVisible();

  await handing.getByRole('button', { name: editName }).click();
  await expect(title(page)).toHaveText('Handed over');
  // The page starts the agent itself; nothing is left to copy.
  await expect(
    page.getByRole('link', { name: 'Read along' }).first(),
  ).toHaveAttribute('href', 'https://agents.example.com/threads/lisbon');
  await expect(page.getByRole('button', { name: 'Copy' })).toHaveCount(0);
  await scan(page);
  await page.keyboard.press('Escape');
  await expect(title(page)).toHaveText('Lisbon, May 2026');
  await expect(handing).toBeHidden();
  // One chosen photo wasn't in the album yet, so it is ordered with the marks.
  await expect(
    page.getByRole('region', { name: 'More photos are being edited' }),
  ).toContainText('An agent is at work');
});

test('fits a phone, where a photo is marked with a finger', {
  tag: mobileDeviceTag,
}, async ({ page, isMobile }) => {
  await shelf(page);
  await scan(page);
  await page.getByRole('link', { name: 'Braga, July' }).click();
  await expect(title(page)).toHaveText('Braga, July 2026');
  await scan(page);

  // The desktop runs this too, at the same time and on a photo of its own.
  await open(page, `/faro/photos/${isMobile ? 'D31' : 'D12'}`);
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

  await page.goto('/?new');
  await expect(title(page)).toHaveText('New album');
  await expect(
    page.getByRole('list', { name: 'Folders, the newest first' }),
  ).toBeVisible();
  await scan(page);
});
