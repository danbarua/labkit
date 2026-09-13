import { expect, test } from "@playwright/test";
import { WALK_END_ID, WALK_START_ID } from "../src/hypermedia";

test("boots the explorer on the first pose and walks hypermedia to NOTE_68", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".current-handle")).toHaveText(WALK_START_ID, { timeout: 30_000 });

  await page.locator('aside a[data-id="LOE_7"]').click();
  await expect(page.locator(".current-handle")).toHaveText("LOE_7");

  await page.locator(`aside a[data-id="${WALK_END_ID}"]`).click();
  await expect(page.locator(".current-handle")).toHaveText(WALK_END_ID);
});

test("resource pane scrolls when neighbor links overflow it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 480 });
  await page.goto("/");
  await expect(page.locator(".current-handle")).toHaveText(WALK_START_ID, { timeout: 30_000 });

  const hub = page.locator('aside a[data-id="LOE_1"]');
  await expect(hub).toBeVisible();
  await hub.click();
  await expect(page.locator(".current-handle")).toHaveText("LOE_1");

  const viewport = page.locator("#resource [data-radix-scroll-area-viewport]");
  const scrollbar = page.locator("#resource .resource-scrollbar");
  const thumb = page.locator("#resource .resource-thumb");
  await expect(viewport).toBeVisible();
  await expect(scrollbar).toBeVisible();
  await expect(thumb).toBeVisible();

  const painted = await scrollbar.evaluate((el) => {
    const css = getComputedStyle(el);
    return { width: css.width, background: css.backgroundColor };
  });
  expect(Number.parseFloat(painted.width)).toBeGreaterThanOrEqual(10);
  expect(painted.background).not.toBe("rgba(0, 0, 0, 0)");

  const box = await viewport.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    scrollTop: el.scrollTop,
  }));
  expect(box.scrollHeight).toBeGreaterThan(box.clientHeight);

  const last = page.locator("aside a[data-id]").last();
  await expect(last).not.toBeInViewport();

  await viewport.hover();
  await page.mouse.wheel(0, 200);
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(box.scrollTop);
  const afterWheel = await viewport.evaluate((el) => el.scrollTop);

  const thumbBox = await thumb.boundingBox();
  expect(thumbBox).not.toBeNull();
  const startY = thumbBox!.y + thumbBox!.height / 2;
  await page.mouse.move(thumbBox!.x + thumbBox!.width / 2, startY);
  await page.mouse.down();
  await page.mouse.move(thumbBox!.x + thumbBox!.width / 2, startY + 120, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(afterWheel);
  await expect(last).toBeInViewport();
});
