import { scanWcag22AaViolations } from '@davidvornholt/a11y-testing/axe';
import { mobileDeviceTag } from '@davidvornholt/a11y-testing/playwright-config';
import { expect, test } from '@playwright/test';

// The light table in every state the made-up shoots have. Tests that change
// something each have a shoot or a photo of their own, since they run side by
// side against one server.

type Page = Parameters<typeof scanWcag22AaViolations>[0];

const frameName = /^(?:Photo \d+ of 43|The photos on the table)/u;
const secondFrame = /^Photo 2 of 43/u;
const photoName = /^Photo \d+$/u;
const leftOutSaid = /Rightly left out/u;
const handOverName = /^Hand over \d+ marks?$/u;
const beforeName = /^Before/u;
const seenName = /^Seen/u;

const scan = async (page: Page) =>
  expect(await scanWcag22AaViolations(page)).toEqual([]);

/** The heading of what is on top; the table under it is inert meanwhile. */
const title = (page: Page) => page.locator('h1:not([inert] h1)');

/** The button that stands for the frame the keyboard is on. */
const frame = (page: Page) => page.getByRole('button', { name: frameName });

const large = (page: Page) => page.getByRole('region', { name: photoName });

const marks = (page: Page) =>
  page.getByRole('list', { name: 'Mark this photo' }).getByRole('button');

/** The button that shows and puts away what is known about a photo. */
const notes = (page: Page) =>
  page.getByRole('button', { name: 'About this photo' });

/** The way back from close; it is there only while a photo is that large. */
const whole = (page: Page) =>
  page.getByRole('button', { name: 'Show the whole photo' });

/** What has stepped aside and can't be reached. */
const aside = (page: Page) => page.locator('[inert]');

const pressed = (page: Page, name: string) =>
  page.getByRole('button', { name, pressed: true });

/** Opens a photo by its address and waits until the keys reach it. */
const open = async (page: Page, path: string) => {
  await page.goto(path);
  await expect(large(page)).toBeFocused();
};

test('shows every shoot at the start and opens one', async ({ page }) => {
  await page.goto('/');
  await expect(title(page)).toHaveText('Keepsake');
  await expect(page.getByText('5 shoots')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Faro, July' })).toContainText(
    'No album yet',
  );
  await expect(page.getByRole('link', { name: 'Lisbon, May' })).toContainText(
    '8 in the album',
  );
  await scan(page);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('link').nth(1)).toBeFocused();
  await scan(page);
  await page.getByRole('link', { name: 'Braga, July' }).focus();
  await page.keyboard.press('Enter');
  await expect(title(page)).toHaveText('Braga, July 2026');
  await page.getByRole('link', { name: 'All shoots' }).click();
  await expect(title(page)).toHaveText('Keepsake');
});

test('says when a shoot is not there', async ({ page }) => {
  await page.goto('/nowhere');
  await expect(title(page)).toHaveText('There is no shoot called nowhere.');
  await scan(page);
  await page.getByRole('button', { name: 'All shoots' }).click();
  await expect(title(page)).toHaveText('Keepsake');
});

test('lays a published shoot on the table', async ({ page }) => {
  await page.goto('/lisbon');
  await expect(title(page)).toHaveText('Lisbon, May 2026');
  await expect(page.getByText('8 in the album of 10')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Album in Immich' }),
  ).toBeVisible();
  const days = page.getByRole('heading', { level: 2 });
  await expect(days).toHaveCount(4);
  await expect(days.first()).toContainText('3 in the album');
  await scan(page);

  await page.keyboard.press('3');
  await expect(pressed(page, 'Left out')).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Shows the same as a photo in the album',
    }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Why left out' }).selectOption({
    label: 'Taken out (1)',
  });
  await expect(days).toHaveCount(1);
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

test('shows shoots that have no album yet', async ({ page }) => {
  await page.goto('/faro');
  await expect(page.getByText('10 chosen').first()).toBeVisible();
  await expect(
    page
      .getByRole('list', { name: 'Which photos' })
      .getByRole('button', { name: 'Chosen' }),
  ).toBeVisible();
  await scan(page);
  await open(page, '/faro/photos/D191');
  await expect(
    large(page).getByText('Chosen, not in the album yet').first(),
  ).toBeVisible();
  await expect(marks(page)).toHaveCount(4);
  await expect(marks(page)).toContainText([
    'Keep',
    'Change',
    'Take out',
    'Favorite',
  ]);
  await scan(page);

  await page.goto('/braga');
  await expect(title(page)).toHaveText('Braga, July 2026');
  await expect(page.getByRole('list', { name: 'Which photos' })).toBeHidden();
  await scan(page);
  await page.goto('/evora');
  await expect(title(page)).toHaveText('Évora, August 2026');
  await scan(page);
});

test('marks a frame on the table with the keyboard and takes it back', async ({
  page,
}) => {
  await page.goto('/braga');
  await frame(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect(frame(page)).toHaveAccessibleName(secondFrame);
  await page.keyboard.press('x');
  await expect(page.getByRole('status')).toContainText(
    "This photo isn't in the album: Put in (P), Leave out (L).",
  );
  await scan(page);
  await page.keyboard.press('l');
  await expect(frame(page)).toHaveAccessibleName(leftOutSaid);
  await scan(page);
  await page.keyboard.press('u');
  await expect(frame(page)).not.toHaveAccessibleName(leftOutSaid);
  await page.keyboard.press('Enter');
  await expect(large(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(large(page)).toBeHidden();
  await expect(frame(page)).toBeFocused();
});

test('compares a finished photo with what it was', async ({ page }) => {
  await open(page, '/lisbon/photos/D121');
  await expect(pressed(page, 'Now')).toBeVisible();
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
  await expect(
    about.getByRole('heading', { name: 'Score 9/10' }),
  ).toBeVisible();
  await expect(
    about.getByRole('link', { name: 'Open in Immich' }),
  ).toBeVisible();
  await scan(page);

  await page.keyboard.press('ArrowRight');
  await expect(large(page)).toHaveAccessibleName('Photo 27');
  await page.keyboard.press('ArrowLeft');
  await expect(large(page)).toHaveAccessibleName('Photo 26');
});

test('shows a photo that was left out next to the one in the album', async ({
  page,
}) => {
  await open(page, '/lisbon/photos/D170');
  await expect(large(page).getByText('In the album').first()).toBeVisible();
  await expect(marks(page)).toHaveCount(3);
  await expect(marks(page)).toContainText(['Put in', 'Swap', 'Leave out']);
  await scan(page);
  // From close the two are compared spot by spot, each in its half.
  await page.keyboard.press('z');
  await expect(aside(page).getByLabel('Mark this photo')).toHaveCount(1);
  await scan(page);
  await whole(page).click();
  await expect(aside(page).getByLabel('Mark this photo')).toHaveCount(0);
  await expect(large(page)).toBeVisible();
  await open(page, '/lisbon/photos/D91');
  await expect(large(page).getByText('Taken out').first()).toBeVisible();
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

test('hands marks over and says what to tell an agent', async ({ page }) => {
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
  await scan(page);

  await takeBack.click();
  await expect(takeBack).toBeHidden();
  await page.keyboard.press('u');
  await expect(takeBack).toBeVisible();

  await handing.getByRole('button', { name: handOverName }).click();
  await expect(title(page)).toHaveText('Handed over');
  await expect(page.getByRole('textbox').first()).toHaveValue(
    'Go through my Keepsake marks',
  );
  await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
  await scan(page);
  await page.keyboard.press('Escape');
  await expect(title(page)).toHaveText('Lisbon, May 2026');
  await expect(handing).toBeHidden();
  await expect(frame(page)).toBeVisible();
});

test('goes through the answers of an agent', async ({ page }) => {
  await page.goto('/porto');
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

test('fits a phone, where a photo is marked with a finger', {
  tag: mobileDeviceTag,
}, async ({ page, isMobile }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Faro, July' }).click();
  await expect(title(page)).toHaveText('Faro, July 2026');
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

  await page.goto('/faro/hand-over');
  await expect(title(page)).toContainText('hand over', { ignoreCase: true });
  await scan(page);
});
