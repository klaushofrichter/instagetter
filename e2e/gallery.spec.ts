import { test, expect, Page } from '@playwright/test';

// The grid renders 9 tiles a page; e2e/server.ts serves 14 slots, so there are
// two pages and the second is short. Both facts are load-bearing below.
const PER_PAGE = 9;

// Every navigation route -- arrows, pager, swipes, tap zones -- goes through
// one 334ms gate (STEP_MIN_MS in page.ts), so a held key cannot outrun the
// server's archive budget. Tests have to respect it or they silently assert
// on a step that was thrown away.
const STEP_MIN_MS = 334;
const settle = (page: Page): Promise<void> => page.waitForTimeout(STEP_MIN_MS + 60);

async function openFirstTile(page: Page): Promise<void> {
  await page.locator('.tile').first().click();
  await expect(page.locator('#modal')).toHaveAttribute('open', '');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // The catalog arrives over fetch, so wait for the grid rather than load.
  await expect(page.locator('.tile').first()).toBeVisible();
});

test.describe('the grid', () => {
  test('renders a full page of tiles with decoded thumbnails', async ({ page }) => {
    await expect(page.locator('.tile')).toHaveCount(PER_PAGE);

    // naturalWidth > 0 is the difference between "an <img> exists" and "the
    // browser actually decoded bytes". A broken src still yields an element.
    const decoded = await page.locator('.tile img').first().evaluate(
      (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
    );
    expect(decoded).toBe(true);
  });

  test('reports the page and total in the pager', async ({ page }) => {
    await expect(page.locator('.pager')).toContainText('Page 1 of 2');
    await expect(page.locator('.pager')).toContainText('14 images');
  });
});

test.describe('pagination', () => {
  test('advances to the second page and back', async ({ page }) => {
    const first = await page.locator('.tile img').first().getAttribute('src');

    await page.locator('#pnext').click();
    await expect(page.locator('.pager')).toContainText('Page 2 of 2');
    await expect(page.locator('.tile')).toHaveCount(14 - PER_PAGE);
    expect(await page.locator('.tile img').first().getAttribute('src')).not.toBe(first);

    await settle(page);
    await page.locator('#pprev').click();
    await expect(page.locator('.pager')).toContainText('Page 1 of 2');
    expect(await page.locator('.tile img').first().getAttribute('src')).toBe(first);
  });

  test('disables the arrow at each end rather than wrapping', async ({ page }) => {
    await expect(page.locator('#pprev')).toBeDisabled();
    await settle(page);
    await page.locator('#pnext').click();
    await expect(page.locator('#pnext')).toBeDisabled();
    await expect(page.locator('#pprev')).toBeEnabled();
  });
});

test.describe('the lightbox', () => {
  test('opens on a tile click and shows that slot', async ({ page }) => {
    await openFirstTile(page);

    await expect(page.locator('#counter')).toHaveText('1 of 14');
    await expect(page.locator('#meta')).toContainText('Caption number 00');
    await expect(page.locator('#meta')).toContainText('Austin, Texas');
  });

  test('offers a download link for the open slot', async ({ page }) => {
    await openFirstTile(page);

    await expect(page.locator('#dl')).toHaveAttribute('href', '/download/SHORT00_01.jpg');
  });

  test('closes on Escape', async ({ page }) => {
    await openFirstTile(page);

    await page.keyboard.press('Escape');
    await expect(page.locator('#modal')).not.toHaveAttribute('open', '');
  });

  test('closes on the close button', async ({ page }) => {
    await openFirstTile(page);

    await page.locator('#close').click();
    await expect(page.locator('#modal')).not.toHaveAttribute('open', '');
  });
});

test.describe('keyboard navigation', () => {
  test('steps forward and back through the archive', async ({ page }) => {
    await openFirstTile(page);

    await settle(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#counter')).toHaveText('2 of 14');
    await expect(page.locator('#meta')).toContainText('Caption number 01');

    await settle(page);
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#counter')).toHaveText('1 of 14');
  });

  test('wraps from the first slot round to the last', async ({ page }) => {
    // Deliberate: step() sends next < 0 to the end of the archive rather than
    // stopping. Asserted so the wrap cannot be dropped by accident.
    await openFirstTile(page);

    await settle(page);
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#counter')).toHaveText('14 of 14');

    await settle(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#counter')).toHaveText('1 of 14');
  });

  test('throttles navigation to one step per 334ms', async ({ page }) => {
    // This gate is what keeps a held arrow key under the server's per-IP
    // archive budget (120/min against a 334ms floor's 180/min). If it stops
    // working the UI can outrun the budget and start rendering 429s.
    await openFirstTile(page);

    await settle(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#counter')).toHaveText('2 of 14');

    // Immediately again: inside the window, so it must be swallowed.
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(120);
    await expect(page.locator('#counter')).toHaveText('2 of 14');

    // Once the window passes, the same key works.
    await settle(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#counter')).toHaveText('3 of 14');
  });

  test('paints the new image rather than leaving the previous one up', async ({ page }) => {
    // The regression this guards: <img> keeps its old bitmap until the new src
    // decodes, so the metadata advanced while the previous picture stayed on
    // screen. Each e2e slot is a distinct colour, so a stale frame is visible
    // as an unchanged src on a settled, decoded image.
    await openFirstTile(page);
    const before = await page.locator('#stage img').getAttribute('src');

    await settle(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#counter')).toHaveText('2 of 14');

    await expect(async () => {
      const img = page.locator('#stage img');
      expect(await img.getAttribute('src')).not.toBe(before);
      const settled = await img.evaluate(
        (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
      );
      expect(settled).toBe(true);
    }).toPass({ timeout: 5000 });
  });
});

test.describe('theme', () => {
  test('toggles and persists across a reload', async ({ page }) => {
    await page.locator('#theme').click();
    const chosen = await page.locator('html').getAttribute('data-theme');
    expect(chosen === 'dark' || chosen === 'light').toBe(true);

    await page.reload();
    await expect(page.locator('.tile').first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', chosen!);
  });
});

test.describe('permalinks', () => {
  test('a shortcode link opens that slot directly', async ({ page }) => {
    await page.goto('/?image=SHORT02');

    await expect(page.locator('#modal')).toHaveAttribute('open', '');
    await expect(page.locator('#meta')).toContainText('Caption number 02');
  });
});

test.describe('the about panel', () => {
  test('opens and closes', async ({ page }) => {
    await page.locator('#about-open').click();
    await expect(page.locator('#about')).toHaveAttribute('open', '');

    await page.locator('#about-close').click();
    await expect(page.locator('#about')).not.toHaveAttribute('open', '');
  });
});
