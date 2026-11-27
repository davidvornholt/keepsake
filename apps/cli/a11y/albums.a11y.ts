import { mobileDeviceTag } from '@davidvornholt/a11y-testing/playwright-config';
import { expect, test } from '@playwright/test';
import { lay, scan, shelf, title } from './page.ts';

// The shelf of albums, and the way of a new one: from a folder of photos
// to the choice, the order, and the agent that edits it. Tests that change
// something each have an album of their own, since they run side by side
// against one server.

const albumCount = /^\d+ albums$/u;
const editAll = /^Edit 10 photos, about \$7\.50$/u;
const coimbra = /Coimbra/u;
const tavira = /Tavira/u;
const stopped = /has stopped$/u;
const englishName =
  /its common English name where it has one, such as Vienna for Wien/u;
const newAlbum = /^New album From/u;
const newAlbumWithKey = /^New album N$/u;

test('shows every album on a shelf, with what waits at each', async ({
  page,
}) => {
  await shelf(page);
  await expect(title(page)).toHaveText('Keepsake');
  await expect(page.getByText(albumCount)).toBeVisible();
  const album = (name: string) => page.getByRole('link', { name });
  await expect(album('Lisbon')).toContainText('8 in the album');
  await expect(album('Lisbon')).toContainText('3 marks to hand over');
  await expect(album('Sagres')).toContainText('10 chosen, ready for your look');
  await expect(album('Braga')).toContainText('Nothing chosen yet');
  await expect(album('Aveiro')).toContainText('Stopped');
  await expect(album('Óbidos')).toContainText('Being edited');
  await scan(page);

  // The arrow keys go from album to album, and Enter opens one.
  await album('Braga').focus();
  await page.keyboard.press('ArrowRight');
  await expect(album('Faro')).toBeFocused();
  await scan(page);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(title(page)).toHaveText('Braga');
  await page.getByRole('link', { name: 'All albums' }).click();
  await expect(title(page)).toHaveText('Keepsake');
});

test('fits the shelf and a new album on a phone', {
  tag: mobileDeviceTag,
}, async ({ page }) => {
  await shelf(page);
  await expect(page.getByRole('link', { name: 'Braga' })).toBeVisible();
  await scan(page);
  await page.getByRole('link', { name: newAlbum }).click();
  await expect(title(page)).toHaveText('New album');
  await expect(
    page.getByRole('list', { name: 'Folders, the newest first' }),
  ).toBeVisible();
  await scan(page);
});

test('says when an album is not there', async ({ page }) => {
  await page.goto('/nowhere');
  await expect(title(page)).toHaveText('There is no album called nowhere.');
  await scan(page);
  await page.getByRole('button', { name: 'All albums' }).click();
  await expect(title(page)).toHaveText('Keepsake');
});

test('finds the folder a new album is made of', async ({ page }) => {
  await shelf(page);
  await expect(page.getByRole('link', { name: newAlbumWithKey })).toBeVisible();
  await page.keyboard.press('n');
  await expect(title(page)).toHaveText('New album');
  await expect(
    page.getByRole('heading', { name: 'Which folder has the photos?' }),
  ).toBeVisible();
  const folders = page.getByRole('list', { name: 'Folders, the newest first' });
  await expect(folders.getByRole('link')).toHaveCount(5);
  await scan(page);

  await page.getByRole('searchbox', { name: 'Search folders' }).fill('tav');
  await expect(folders.getByRole('link')).toHaveCount(1);
  await folders.getByRole('link', { name: tavira }).click();
  const named = page.getByRole('textbox', {
    name: 'What is the album called?',
  });
  await expect(named).toBeFocused();
  await expect(named).toHaveAccessibleDescription(englishName);
  await expect(page.getByText('09:00 on 18 October')).toBeVisible();
  await scan(page);
});

test('makes a new album of a folder, and throws it away', async ({ page }) => {
  await page.goto('/?new');
  await page.getByRole('link', { name: coimbra }).click();
  await expect(
    page.getByRole('textbox', { name: 'What is the album called?' }),
  ).toHaveValue('Coimbra');
  await page
    .getByRole('textbox', { name: 'Where and when?' })
    .fill('Coimbra, Portugal, October 2026');
  await page.getByRole('button', { name: 'Make the album' }).click();
  await expect(title(page)).toHaveText('Coimbra');
  const making = page.getByRole('region', { name: 'Getting the album ready' });
  await expect(making).toBeVisible();
  await scan(page);

  // No model is signed in here, so it stops after the photos are read, and
  // says why.
  await expect(making.getByRole('heading', { name: stopped })).toBeVisible();
  await expect(making.getByRole('alert')).not.toBeEmpty();
  await expect(page.getByText('8 photos').first()).toBeVisible();
  await expect(making.getByRole('button', { name: 'Go on' })).toBeVisible();
  await scan(page);

  await making.getByRole('button', { name: 'Throw away' }).click();
  const asked = page.getByRole('dialog');
  await expect(asked).toContainText('Throw away “Coimbra”?');
  await scan(page);
  await asked.getByRole('button', { name: 'Throw away' }).click();
  await expect(title(page)).toHaveText('Keepsake');
  await expect(page.getByRole('link', { name: coimbra })).toHaveCount(0);
});

test('says how far a new album is', async ({ page }) => {
  await lay(page, '/aveiro', 'Aveiro');
  const ready = page.getByRole('region', { name: 'Getting the album ready' });
  await expect(ready.getByRole('heading', { name: stopped })).toBeVisible();
  await expect(ready.getByRole('alert')).toHaveText(
    'The model’s limit is reached. It is free again at 14:00.',
  );
  await expect(ready.getByRole('listitem').first()).toContainText(
    'Reading the photos',
  );
  await scan(page);
});

test('says how far an album is that an agent works on', async ({ page }) => {
  await lay(page, '/obidos', 'Óbidos');
  const edited = page.getByRole('region', {
    name: 'The album is being edited',
  });
  await expect(edited.getByText('0 of 10 photos edited')).toBeVisible();
  await scan(page);
  // Nobody took the order, so the page offers to start an agent once more,
  // and says what to tell one.
  await edited.getByRole('button', { name: 'Ask an agent' }).click();
  await expect(title(page)).toHaveText('The album is ordered');
  await expect(
    page.getByRole('button', { name: 'Start an agent' }),
  ).toBeEnabled();
  await expect(page.getByRole('textbox').first()).toHaveValue(
    'Go through my Keepsake marks',
  );
  await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
  await scan(page);
});

test('goes over what was chosen for an album', {
  tag: mobileDeviceTag,
}, async ({ page }) => {
  await lay(page, '/faro', 'Faro');
  const choice = page.getByRole('region', { name: 'The choice' });
  await expect(
    choice.getByRole('heading', {
      name: '10 of 43 photos chosen for the album',
    }),
  ).toBeVisible();
  await scan(page);

  await choice.getByRole('button', { name: 'Order the album' }).click();
  await expect(title(page)).toHaveText('Order the album');
  const order = page.getByRole('region', { name: 'Order the album' });
  await expect(order).toContainText('10 photos are chosen.');
  await expect(order).toContainText('An agent is started for it');
  await scan(page);
});

test('orders an album, which an agent is started for', async ({ page }) => {
  await lay(page, '/sagres', 'Sagres');
  await page.getByRole('button', { name: 'Order the album' }).click();
  await page
    .getByRole('region', { name: 'Order the album' })
    .getByRole('button', { name: editAll })
    .click();
  // The agent that is started says where it can be read along.
  const along = page.getByRole('link', { name: 'Read along' }).first();
  await expect(along).toHaveAttribute(
    'href',
    'https://agents.example.com/threads/sagres',
  );
  await scan(page);
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('region', { name: 'The album is being edited' }),
  ).toContainText('An agent is at work');
  await scan(page);
});
