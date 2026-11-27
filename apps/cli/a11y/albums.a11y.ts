import { mobileDeviceTag } from '@davidvornholt/a11y-testing/playwright-config';
import { expect, test } from '@playwright/test';
import { large, lay, type Page, scan, shelf, title } from './page.ts';

// The shelf of albums, and the way of a new one: from a folder of photos
// to the choice, the order, and keepsake editing it. Tests that change
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
const joinsTavira =
  /Immich has an album called Tavira already, with photos of 2 October to 4 October 2025\. The photos join it/u;
const newAlbumWithKey = /^New album N$/u;
const newThings = /^\d+ new things? to look at$/u;
const goOnForMore = /^Go on, at most \$11\.25 more$/u;
const usedUp = /^What you agreed to pay is used up/u;
const sintraNews = /\/sintra\/news\?across$/u;
const albumsAnswer = '**/api/albums';
const looking = 'Looking for albums of this name in Immich.';
const sharedLagos =
  /Friend shared an album called Lagos with you, with photos of 5 October 2025\. The photos go into a new album of your own instead\./u;

/** The name of a new album of the Tavira folder, as the page asks for it. */
const nameTavira = async (page: Page) => {
  await page.goto('/?new');
  await page.getByRole('link', { name: tavira }).click();
  return page.getByRole('textbox', { name: 'What is the album called?' });
};

test('shows every album on a shelf, with what waits at each', async ({
  page,
}) => {
  await shelf(page);
  await expect(title(page)).toHaveText('Keepsake');
  await expect(page.getByText(albumCount)).toBeVisible();
  const album = (name: string) => page.getByRole('link', { name });
  await expect(album('Lisbon')).toContainText('8 in the album');
  await expect(album('Lisbon')).toContainText('2 marks to hand over');
  await expect(album('Sagres')).toContainText('10 chosen, ready for your look');
  await expect(album('Braga')).toContainText('Nothing chosen yet');
  await expect(album('Aveiro')).toContainText('Stopped');
  await expect(album('Óbidos')).toContainText('Being edited');
  await expect(album('Sintra')).toContainText('Waits for you');
  await expect(page.getByRole('button', { name: newThings })).toBeVisible();
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
  // Immich has an album of that name, which the photos join.
  await expect(named).toHaveAccessibleDescription(joinsTavira);
  await scan(page);
  await named.fill('Tavira beaches');
  await expect(named).not.toHaveAccessibleDescription(joinsTavira);
});

test('says what Immich has of the name, however it is written', async ({
  page,
}) => {
  const named = await nameTavira(page);
  await expect(named).toHaveAccessibleDescription(joinsTavira);
  await named.fill(' tavira ');
  await expect(named).toHaveAccessibleDescription(joinsTavira);
  // An album another account shares isn't joined.
  await named.fill('Lagos');
  await expect(named).toHaveAccessibleDescription(sharedLagos);
  await scan(page);
});

test('says it looks while Immich is slow to answer', async ({ page }) => {
  const answered = Promise.withResolvers<void>();
  await page.route(albumsAnswer, async (route) => {
    await answered.promise;
    await route.continue();
  });
  const named = await nameTavira(page);
  await expect(page.getByText(looking)).toBeVisible();
  await scan(page);
  answered.resolve();
  await expect(named).toHaveAccessibleDescription(joinsTavira);
  await expect(page.getByText(looking)).toHaveCount(0);
});

test('says when it can’t ask Immich, and asks again', async ({ page }) => {
  await page.route(albumsAnswer, (route) =>
    route.fulfill({ status: 502, json: { error: 'Immich is not reachable.' } }),
  );
  const named = await nameTavira(page);
  const failed = page.getByText(
    'Keepsake couldn’t look for albums of this name in Immich, so it can’t say whether the photos join one: Immich is not reachable.',
  );
  await expect(failed).toBeVisible();
  await scan(page);
  await page.unroute(albumsAnswer);
  await page.getByRole('button', { name: 'Look again' }).click();
  await expect(named).toHaveAccessibleDescription(joinsTavira);
  await expect(failed).toHaveCount(0);
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

test('says how far an album is that keepsake works on', async ({ page }) => {
  await lay(page, '/obidos', 'Óbidos');
  const ordered = page.getByRole('region', { name: 'The order', exact: true });
  await expect(
    ordered.getByRole('heading', { name: 'The album is being edited' }),
  ).toBeVisible();
  await expect(ordered.getByText('0 of 10 photos edited')).toBeVisible();
  await expect(ordered).toContainText('Keepsake is at work');
  await expect(ordered.getByRole('button', { name: 'Go on' })).toHaveCount(0);
  await scan(page);
  await ordered.getByRole('button', { name: 'The order' }).click();
  await expect(title(page)).toHaveText('The album is ordered');
  await expect(page.getByText('Keepsake is at work on it.')).toBeVisible();
  await scan(page);
});

test('walks to what waits for the owner, who goes on', async ({ page }) => {
  await shelf(page);
  // What waits at Sintra is the oldest of what is new.
  await page.getByRole('button', { name: newThings }).click();
  await expect(page).toHaveURL(sintraNews);
  await expect(large(page)).toBeVisible();
  await expect(page.getByText('New 1 of 1')).toBeVisible();
  await expect(large(page).getByText('Waits for you').first()).toBeVisible();
  await expect(large(page).getByText(usedUp).first()).toBeVisible();
  await scan(page);
  await page.keyboard.press('Escape');
  await expect(title(page)).toHaveText('Keepsake');

  await lay(page, '/sintra', 'Sintra');
  const ordered = page.getByRole('region', { name: 'The order', exact: true });
  await expect(ordered.getByRole('alert')).toHaveText(usedUp);
  await scan(page);
  // Going on agrees to as much more as the rest may cost.
  await ordered.getByRole('button', { name: goOnForMore }).click();
  await expect(
    ordered.getByRole('heading', { name: 'The album is being edited' }),
  ).toBeVisible();
  await expect(ordered.getByRole('alert')).toHaveCount(0);
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
  // It says what the edits come to, and the most it may cost.
  await expect(order).toContainText('About $0.75, at most $1.13');
  await expect(order).toContainText('Keepsake starts at once');
  await scan(page);
});

test('orders an album, which keepsake edits at once', async ({ page }) => {
  await lay(page, '/sagres', 'Sagres');
  await page.getByRole('button', { name: 'Order the album' }).click();
  await page
    .getByRole('region', { name: 'Order the album' })
    .getByRole('button', { name: editAll })
    .click();
  await expect(title(page)).toHaveText('The album is ordered');
  await scan(page);
  await page.keyboard.press('Escape');
  // No model is signed in here, so editing stops, and the page says why and
  // offers to go on, instead of saying that it is being edited.
  const ordered = page.getByRole('region', { name: 'The order', exact: true });
  await expect(ordered.getByRole('alert')).not.toBeEmpty();
  await expect(ordered.getByRole('button', { name: 'Go on' })).toBeVisible();
  await expect(
    ordered.getByRole('heading', { name: 'The album is ordered' }),
  ).toBeVisible();
  await scan(page);
});
