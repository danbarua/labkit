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

const header = (page: import("@playwright/test").Page) => page.locator(".header-id");
const row = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const item = (page: import("@playwright/test").Page, handle: string) =>
  page.locator(".sidebar .res-item", {
    has: page.locator(".rid", { hasText: new RegExp(`^${handle}$`) }),
  });
const list = (path: string) => `list=${encodeURIComponent(path)}`;

test.describe("getting around", () => {
  test("a browser at the root lands on the app, with the workspaces", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/app\/$/);
    await expect(row(page, "alpha")).toBeVisible();
    await expect(row(page, "beta")).toBeVisible();
  });

  test("workspace, then collection, then resource, by clicking", async ({ page }) => {
    await page.goto("/app/");
    await row(page, "alpha").click();
    await expect(page).toHaveURL(new RegExp(list("/workspace/alpha")));

    await row(page, "Question").click();
    await expect(page).toHaveURL(new RegExp(list("/workspace/alpha/question")));
    await expect(item(page, "Q_1")).toBeVisible();
    await expect(item(page, "Q_2")).toBeVisible();

    await item(page, "Q_1").click();
    await expect(page).toHaveURL(/\/app\/workspace\/alpha\/Q_1\?/);
    await expect(header(page)).toHaveText("Q_1");
    await expect(item(page, "Q_1")).toHaveClass(/active/);
  });

  test("the home button leads back to the workspaces", async ({ page }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await page.getByRole("button", { name: "Entry point" }).click();
    await expect(page).toHaveURL(/\/app\/$/);
    await expect(page.getByText("Pick a type on the left")).toBeVisible();
  });

  test("a deep link renders directly, and survives a reload", async ({ page }) => {
    await page.goto("/app/workspace/alpha/LOE_1");
    await expect(header(page)).toHaveText("LOE_1");
    await page.reload();
    await expect(header(page)).toHaveText("LOE_1");
  });

  test("a path that names a collection lists it", async ({ page }) => {
    await page.goto("/app/workspace/alpha/question");
    await expect(item(page, "Q_1")).toBeVisible();
    await expect(page.getByText("Pick a type on the left")).toBeVisible();
  });

  test("a collection's next page is added on request", async ({ page }) => {
    await page.goto(`/app/?${list("/workspace/alpha/question?limit=1")}`);
    await expect(item(page, "Q_1")).toBeVisible();
    await expect(item(page, "Q_2")).toHaveCount(0);
    await page.getByRole("button", { name: "Load more" }).click();
    await expect(item(page, "Q_2")).toBeVisible();
    await expect(item(page, "Q_1")).toBeVisible();
  });
});

test.describe("an open resource", () => {
  test("shows its properties and the resources it relates to", async ({ page }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await expect(header(page)).toHaveText("Q_1");
    await expect(page.locator(".header-type")).toHaveText("Question");
    await expect(page.locator(".detail .kv .k", { hasText: "name" }).first()).toBeVisible();
    await expect(page.locator(".detail").getByText("alpha question")).toBeVisible();
    await expect(page.locator(".card-head", { hasText: "LOE_1" })).toBeVisible();
  });

  test("lists what relates to it on the right", async ({ page }) => {
    await page.goto("/app/workspace/alpha/LOE_1");
    const incoming = page.locator(".relations-col");
    await expect(incoming.locator(".rid", { hasText: /^Q_1$/ })).toBeVisible();
    await expect(incoming.locator(".rid", { hasText: /^EU_1$/ })).toBeVisible();
  });

  test("following a relation navigates in place, without reloading the page", async ({ page }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await expect(header(page)).toHaveText("Q_1");
    await page.evaluate(() => {
      (window as unknown as { kept: boolean }).kept = true;
    });

    await page.locator(".card-head", { hasText: "LOE_1" }).click();
    await expect(page).toHaveURL(/\/app\/workspace\/alpha\/LOE_1$/);
    await expect(header(page)).toHaveText("LOE_1");
    expect(await page.evaluate(() => (window as unknown as { kept?: boolean }).kept)).toBe(true);
  });

  test("back and forward, the browser's or the page's, step through what was opened", async ({
    page,
  }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await page.locator(".card-head", { hasText: "LOE_1" }).click();
    await expect(header(page)).toHaveText("LOE_1");

    await page.goBack();
    await expect(header(page)).toHaveText("Q_1");
    await page.getByRole("button", { name: "Forward" }).click();
    await expect(header(page)).toHaveText("LOE_1");
    await expect(page.getByRole("button", { name: "Forward" })).toBeDisabled();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(header(page)).toHaveText("Q_1");
  });

  test("opening the resource that is open adds no history entry", async ({ page }) => {
    await page.goto(`/app/workspace/alpha/Q_1?${list("/workspace/alpha/question")}`);
    await expect(header(page)).toHaveText("Q_1");
    await item(page, "Q_1").click();
    await expect(header(page)).toHaveText("Q_1");
    await expect(page.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  test("the Debug tab shows the response and the record's events", async ({ page }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await page.getByRole("tab", { name: "Debug" }).click();
    await expect(page).toHaveURL(/tab=debug/);
    await expect(page.locator(".ev").first()).toBeVisible();
    await page.getByRole("button", { name: "Show or hide the response" }).click();
    await expect(page.locator("pre.jsonview")).toContainText("alpha question");
  });

  test("reloading on the Debug tab fetches the events again and shows them", async ({ page }) => {
    await page.goto("/app/workspace/alpha/Q_1?tab=debug");
    await expect(page.locator(".ev").first()).toBeVisible();
    const refetched = page.waitForResponse((r) => r.url().includes("/workspace/alpha/Q_1/events"));
    await page.getByRole("button", { name: "Reload from the API" }).click();
    await refetched;
    await expect(page.getByText("loading events…")).toHaveCount(0);
    await expect(page.locator(".ev").first()).toBeVisible();
  });
});

test.describe("a narrow window", () => {
  test.use({ viewport: { width: 1000, height: 800 } });

  test("the inbound relations are a drawer that closes when a row is opened", async ({ page }) => {
    await page.goto("/app/workspace/alpha/LOE_1");
    const drawer = page.locator(".relations-col");
    await expect(drawer).not.toHaveClass(/open/);
    await page.getByRole("button", { name: "Toggle relations column" }).click();
    await expect(drawer).toHaveClass(/open/);
    await drawer.locator(".res-item", { hasText: "Q_1" }).click();
    await expect(header(page)).toHaveText("Q_1");
    await expect(drawer).not.toHaveClass(/open/);
  });
});

test.describe("the graph tab", () => {
  test("draws the graph on the canvas", async ({ page }) => {
    await page.goto("/app/workspace/alpha/LOE_1?tab=graph");
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

  test("the view and colour toggles switch, and there is no standing overlay", async ({ page }) => {
    await page.goto("/app/workspace/alpha/Q_1?tab=graph");
    const view3d = page.locator('[data-view="3d"]');
    await view3d.click();
    await expect(view3d).toHaveAttribute("aria-pressed", "true");
    const temporal = page.locator('[data-overlay="temporal"]');
    await temporal.click();
    await expect(temporal).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-overlay="standing"]')).toHaveCount(0);
  });

  test("the tab stays open as another resource is opened", async ({ page }) => {
    await page.goto("/app/workspace/alpha/LOE_1?tab=graph");
    await page.locator(".relations-col .res-item", { hasText: "Q_1" }).click();
    await expect(header(page)).toHaveText("Q_1");
    await expect(page).toHaveURL(/\/Q_1\?tab=graph$/);
    await expect(page.locator("#stage")).toBeVisible();
  });
});

test.describe("workspaces are separate", () => {
  test("the same handle is a different resource in each", async ({ page }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await expect(page.locator(".detail").getByText("alpha question")).toBeVisible();
    await page.goto("/app/workspace/beta/Q_1");
    await expect(page.locator(".detail").getByText("beta question")).toBeVisible();
    await expect(page.locator(".detail").getByText("alpha question")).toHaveCount(0);
  });

  test("a handle that lives in another workspace is an error, not a fallback", async ({
    page,
    errors,
  }) => {
    await page.goto("/app/workspace/beta/LOE_1");
    await expect(page.locator(".fetch-error")).toContainText("404");
    errors.length = 0;
  });

  test("links inside a workspace stay inside it", async ({ page }) => {
    await page.goto(`/app/?${list("/workspace/beta/question")}`);
    await item(page, "Q_1").click();
    await expect(page).toHaveURL(/\/app\/workspace\/beta\/Q_1\?/);
    await expect(page.locator(".detail").getByText("beta question")).toBeVisible();
  });
});

test.describe("when something is not there", () => {
  test("an unknown workspace says so", async ({ page, errors }) => {
    await page.goto("/app/workspace/nowhere");
    await expect(page.locator(".fetch-error")).toContainText("404");
    errors.length = 0;
  });

  test("an unknown handle says so", async ({ page, errors }) => {
    await page.goto("/app/workspace/alpha/Q_999");
    await expect(page.locator(".fetch-error")).toContainText("404");
    errors.length = 0;
  });
});

test.describe("the API keeps its own paths", () => {
  test("a browser going to an API path gets the API's answer, not the app", async ({ page }) => {
    const response = await page.goto("/workspace/alpha/Q_1");
    expect(response?.headers()["content-type"]).toContain("application/hal+json");
    expect(JSON.parse(await page.locator("body").innerText())).toMatchObject({ id: "Q_1" });
  });

  test("even a client asking for HTML gets JSON from the API's paths", async ({ request }) => {
    const response = await request.get("/workspace/alpha/Q_1", {
      headers: { accept: "text/html" },
    });
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
