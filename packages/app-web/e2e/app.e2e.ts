import { expect, test as base } from "@playwright/test";

/**
 * The browser app, driven as a person would. Every test runs against both the Vite dev server and
 * the built bundle. The data is the two-workspace fixture in `tests/support/scratch-db.ts`.
 */

const test = base.extend<{ errors: string[] }>({
  // Anything the page logs as an error fails the test, which is how a broken bundle shows up: a
  // second copy of React, a module that did not load. A test that provokes an error on purpose
  // asserts on it and then clears the list.
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
      page.on("console", (msg) => {
        const { url } = msg.location();
        // A browser showing a JSON document asks for a favicon, and there is none to give.
        if (msg.type() === "error" && !url.endsWith("/favicon.ico")) {
          errors.push(`console: ${msg.text()} ${url}`);
        }
      });
      await use(errors);
      expect(errors, "errors in the browser").toEqual([]);
    },
    { auto: true },
  ],
});

const handle = (page: import("@playwright/test").Page) => page.locator(".current-handle");

test.describe("getting around", () => {
  test("a browser at the root lands on the app, with the workspaces", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/app\/$/);
    await expect(page.getByRole("heading", { name: "Workspaces" })).toBeVisible();
    await expect(page.getByRole("link", { name: "alpha", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "beta", exact: true })).toBeVisible();
  });

  test("workspace, then collection, then graph, by clicking", async ({ page }) => {
    await page.goto("/app/");
    await page.getByRole("link", { name: "alpha", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/workspace\/alpha$/);

    await page.getByRole("link", { name: "question", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/workspace\/alpha\/question$/);
    await expect(page.getByRole("link", { name: "Q_1", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Q_2", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Q_3", exact: true }), "retracted").toHaveCount(0);

    await page.getByRole("link", { name: "Q_1", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/workspace\/alpha\/graph\/Q_1$/);
    await expect(handle(page)).toHaveText("Q_1");
  });

  test("the header leads back up", async ({ page }) => {
    await page.goto("/app/workspace/alpha/graph/Q_1");
    await page.getByRole("link", { name: "alpha", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/workspace\/alpha$/);
    await page.getByRole("link", { name: /LabKit/ }).click();
    await expect(page).toHaveURL(/\/app\/$/);
  });

  test("a deep link renders directly, and survives a reload", async ({ page }) => {
    await page.goto("/app/workspace/alpha/graph/LOE_1");
    await expect(handle(page)).toHaveText("LOE_1");
    await page.reload();
    await expect(handle(page)).toHaveText("LOE_1");
  });

  test("a collection pages forward and back", async ({ page }) => {
    await page.goto("/app/workspace/alpha/question?limit=1");
    await expect(page.getByRole("link", { name: "Q_1", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /previous/ })).toHaveCount(0);

    await page.getByRole("link", { name: /next/ }).click();
    await expect(page).toHaveURL(/limit=1&offset=1|offset=1&limit=1/);
    await expect(page.getByRole("link", { name: "Q_2", exact: true })).toBeVisible();

    await page.getByRole("link", { name: /previous/ }).click();
    await expect(page.getByRole("link", { name: "Q_1", exact: true })).toBeVisible();
  });
});

test.describe("the graph page", () => {
  test("shows the resource, its properties and its links", async ({ page }) => {
    await page.goto("/app/workspace/alpha/graph/Q_1");
    const panel = page.locator("#resource");
    await expect(panel.locator(".handle")).toHaveText("Q_1");
    await expect(panel.locator(".kind")).toHaveText("Question");
    await expect(panel.locator("dt", { hasText: "name" })).toBeVisible();
    await expect(panel.getByText("alpha question")).toBeVisible();
    await expect(panel.locator('a[data-id="LOE_1"]')).toBeVisible();
  });

  test("draws the graph on the canvas", async ({ page }) => {
    await page.goto("/app/workspace/alpha/graph/LOE_1");
    const canvas = page.locator("#stage");
    await expect(canvas).toBeVisible();
    // A canvas that was sized but never drawn on has one colour in it.
    await expect
      .poll(() =>
        canvas.evaluate((el) => {
          const c = el as HTMLCanvasElement;
          const ctx = c.getContext("2d");
          if (!ctx) return 0;
          const data = ctx.getImageData(0, 0, c.width, c.height).data;
          const seen = new Set<number>();
          for (let i = 0; i < data.length && seen.size < 8; i += 4 * 97) {
            seen.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
          }
          return seen.size;
        }),
      )
      .toBeGreaterThan(2);
  });

  test("following a link navigates in place, without reloading the page", async ({ page }) => {
    await page.goto("/app/workspace/alpha/graph/Q_1");
    await expect(handle(page)).toHaveText("Q_1");
    await page.evaluate(() => {
      (window as unknown as { kept: boolean }).kept = true;
    });

    await page.locator('#resource a[data-id="LOE_1"]').click();
    await expect(page).toHaveURL(/\/graph\/LOE_1/);
    await expect(handle(page)).toHaveText("LOE_1");
    expect(await page.evaluate(() => (window as unknown as { kept?: boolean }).kept)).toBe(true);
  });

  test("the back button returns to the previous resource", async ({ page }) => {
    await page.goto("/app/workspace/alpha/graph/Q_1");
    await page.locator('#resource a[data-id="LOE_1"]').click();
    await expect(handle(page)).toHaveText("LOE_1");
    await page.goBack();
    await expect(handle(page)).toHaveText("Q_1");
  });

  test("a chosen depth stays in the URL as you follow links", async ({ page }) => {
    await page.goto("/app/workspace/alpha/graph/Q_1?depth=2");
    await page.locator('#resource a[data-id="LOE_1"]').click();
    await expect(page).toHaveURL(/\/graph\/LOE_1\?depth=2$/);
  });

  test("the view and colour toggles switch", async ({ page }) => {
    await page.goto("/app/workspace/alpha/graph/Q_1");
    const view3d = page.locator('[data-view="3d"]');
    await view3d.click();
    await expect(view3d).toHaveClass(/active/);
    const standing = page.locator('[data-overlay="standing"]');
    await standing.click();
    await expect(standing).toHaveClass(/active/);
  });
});

test.describe("workspaces are separate", () => {
  test("the same handle is a different resource in each", async ({ page }) => {
    await page.goto("/app/workspace/alpha/graph/Q_1");
    await expect(page.locator("#resource").getByText("alpha question")).toBeVisible();
    await page.goto("/app/workspace/beta/graph/Q_1");
    await expect(page.locator("#resource").getByText("beta question")).toBeVisible();
    await expect(page.locator("#resource").getByText("alpha question")).toHaveCount(0);
  });

  test("a handle that lives in another workspace is an error, not a fallback", async ({
    page,
    errors,
  }) => {
    await page.goto("/app/workspace/beta/graph/LOE_1");
    await expect(page.locator(".load-error")).toContainText("404");
    errors.length = 0;
  });

  test("links inside a workspace stay inside it", async ({ page }) => {
    await page.goto("/app/workspace/beta");
    await page.getByRole("link", { name: "question", exact: true }).click();
    await page.getByRole("link", { name: "Q_1", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/workspace\/beta\/graph\/Q_1$/);
    await expect(page.locator("#resource").getByText("beta question")).toBeVisible();
  });
});

test.describe("when something is not there", () => {
  test("an unknown workspace says so", async ({ page, errors }) => {
    await page.goto("/app/workspace/nowhere");
    await expect(page.locator(".load-error")).toContainText("404");
    errors.length = 0;
  });

  test("an unknown handle says so", async ({ page, errors }) => {
    await page.goto("/app/workspace/alpha/graph/Q_999");
    await expect(page.locator(".load-error")).toContainText("404");
    errors.length = 0;
  });

  test("a depth the API refuses is shown as the API's answer", async ({ page, errors }) => {
    await page.goto("/app/workspace/alpha/graph/Q_1?depth=9");
    await expect(page.locator(".load-error")).toContainText("400");
    errors.length = 0;
  });

  test("an unknown collection says so", async ({ page, errors }) => {
    await page.goto("/app/workspace/alpha/nope");
    await expect(page.locator(".load-error")).toContainText("404");
    errors.length = 0;
  });

  test("an unknown page in the app is not found, with a way home", async ({ page }) => {
    await page.goto("/app/nothing/here");
    await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
    await page.getByRole("link", { name: /Back to the workspaces/ }).click();
    await expect(page).toHaveURL(/\/app\/$/);
  });
});

test.describe("the API keeps its own paths", () => {
  test("a browser going to an API path gets the API's answer, not the app", async ({ page }) => {
    const response = await page.goto("/workspace/alpha/Q_1");
    expect(response?.headers()["content-type"]).toContain("application/hal+json");
    expect(JSON.parse(await page.locator("body").innerText())).toMatchObject({ id: "Q_1" });
  });

  test("even a client asking for HTML gets JSON from the API's paths", async ({ request }) => {
    const response = await request.get("/graph/Q_1", { headers: { accept: "text/html" } });
    expect(response.headers()["content-type"]).toContain("application/hal+json");
  });

  test("a path nothing claims is a 404, not the app", async ({ request }) => {
    const response = await request.get("/nope", { headers: { accept: "text/html" } });
    expect(response.status()).toBe(404);
    // The preview server answers paths outside the app itself, in its own words.
    if (test.info().project.name === "dev") {
      expect(response.headers()["content-type"]).toContain("application/problem+json");
    }
  });
});
