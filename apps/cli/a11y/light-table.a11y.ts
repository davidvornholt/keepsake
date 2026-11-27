import { mobileDeviceTag } from '@davidvornholt/a11y-testing/playwright-config';
import { expect, test } from '@playwright/test';
import { frame, large, lay, open, pressed, scan, title } from './page.ts';

// The light table with the made-up albums on it. Tests that change something
// each have an album or a photo of their own, since they run side by side
// against one server.

const secondFrame = /^Photo 4 of 43/u;
const takenOutSaid = /Taken out by you/u;
const stackOfFive =
  /^Photo 15 of 43.*In front of a stack of 5.*Space lays the stack out$/u;
const laidOut =
  /^Photo 15 of 43.*Its stack is laid out.*Space puts the stack together$/u;
const behindInStack = /^Photo 16 of 43.*Its stack is laid out/u;
const editName = /^Edit \d+ photos?, about \$/u;

/** A way to look at the table, with how many stacks it shows and its key. */
const viewOf = (name: string, stacks: number) =>
  new RegExp(`^${name}\\s*${stacks}\\s*\\d$`, 'u');

test('lays a published album on the table', async ({ page }) => {
  await lay(page, '/lisbon', 'Lisbon');
  await expect(page.getByText('43 photos in 17 stacks').first()).toBeVisible();
  await expect(page.getByText('8 in the album of at most 10')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Album in Immich' }),
  ).toBeVisible();
  // Only the days: the test that hands marks over orders this album too,
  // meanwhile, which says so under a heading of its own.
  const days = page
    .getByRole('heading', { level: 2 })
    .filter({ hasNotText: 'More photos are' });
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

test('shows albums that nothing is chosen for yet', {
  tag: mobileDeviceTag,
}, async ({ page }) => {
  await lay(page, '/braga', 'Braga');
  await expect(page.getByText('Nothing chosen yet')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Which photos' })).toBeHidden();
  await scan(page);
  await lay(page, '/evora', 'Évora');
  await scan(page);
});

test('opens a stack on the table and closes it', async ({ page }) => {
  await lay(page, '/evora', 'Évora');
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

test('takes a photo out on the table with the keyboard and puts it back', async ({
  page,
}) => {
  await lay(page, '/cascais', 'Cascais');
  await frame(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect(frame(page)).toHaveAccessibleName(secondFrame);
  // A photo that isn't in the album can't be taken out: the page says what
  // can be done with it.
  await page.keyboard.press('x');
  await expect(page.getByRole('status')).toContainText('Put in (P)');
  await scan(page);
  // A chosen one is taken out at once.
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

test('hands marks over to an agent that is started for them', async ({
  page,
}) => {
  await open(page, '/lisbon/photos/D111');
  await page.keyboard.press('c');
  const note = page.getByRole('textbox', { name: 'What should change?' });
  await note.fill('Less sky.');
  await note.press('Enter');
  await expect(pressed(page, 'Change')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(large(page)).toBeHidden();
  await page.keyboard.press('h');
  await expect(title(page)).toHaveText('Hand over');
  const handing = page.getByRole('region', { name: 'Hand over', exact: true });
  const takeBack = page
    .getByRole('region', { name: 'To hand over' })
    .getByRole('button', { name: 'Take back: To be changed, photo 24' });
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
  await expect(title(page)).toHaveText('Lisbon');
  await expect(handing).toBeHidden();
  // One chosen photo wasn't in the album yet, so it is ordered with the marks.
  await expect(
    page.getByRole('region', { name: 'More photos are being edited' }),
  ).toContainText('An agent is at work');
});
