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
// The canvas's nodes are also a visually hidden list of buttons, for the keyboard, which is how
// these tests pick a node: a canvas has no element to click.
const node = (page: import("@playwright/test").Page, name: string | RegExp) =>
  page.getByRole("list", { name: "Nodes in the graph" }).getByRole("button", { name });

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

  test("a path that names a collection lists it, and keeps it listed when an item opens", async ({
    page,
  }) => {
    await page.goto("/app/workspace/alpha/question");
    await expect(item(page, "Q_1")).toBeVisible();
    await expect(page.getByText("Pick a type on the left")).toBeVisible();
    await item(page, "Q_1").click();
    await expect(header(page)).toHaveText("Q_1");
    await expect(page).toHaveURL(new RegExp(`/Q_1\\?${list("/workspace/alpha/question")}$`));
    await expect(item(page, "Q_1")).toHaveClass(/active/);
  });

  test("a collection picked from the upper pane loads below it, and the upper pane stays", async ({
    page,
  }) => {
    await page.goto(`/app/?${list("/workspace/alpha")}`);
    await expect(row(page, "Question")).toBeVisible();
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/workspace/alpha/question*", async (route) => {
      await held;
      await route.continue();
    });
    await row(page, "Question").click();
    await expect(page.locator(".sidebar .res-list .spinner")).toBeVisible();
    await expect(row(page, "Question")).toHaveClass(/active/);
    await expect(row(page, "LineOfEnquiry")).toBeVisible();
    release();
    await expect(item(page, "Q_1")).toBeVisible();
    await expect(row(page, "LineOfEnquiry")).toBeVisible();
  });

  test("opening a resource of another type than the listed one closes the Items pane", async ({
    page,
  }) => {
    await page.goto(`/app/?${list("/workspace/alpha/question")}`);
    await item(page, "Q_1").click();
    await expect(header(page)).toHaveText("Q_1");
    await expect(item(page, "Q_2")).toBeVisible();

    await page.locator(".card-head", { hasText: "LOE_1" }).click();
    await expect(header(page)).toHaveText("LOE_1");
    await expect(page).toHaveURL(new RegExp(`${list("/workspace/alpha")}$`));
    await expect(page.getByText("Pick a collection above to list its items.")).toBeVisible();
    await expect(row(page, "Question")).toBeVisible();
  });

  test("the Items pane loads pages until the open resource's row is there, and lights it", async ({
    page,
  }) => {
    await page.goto(`/app/workspace/alpha/act/3?${list("/workspace/alpha/act?limit=1")}`);
    await expect(header(page)).toHaveText("3");
    await expect(page.locator(".sidebar .res-item")).toHaveCount(3);
    await expect(page.locator(".sidebar .res-item.active")).toContainText("LOE_1");
    await expect(page.locator(".sidebar .res-item.active")).toBeInViewport();
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

  test("shows the resources that relate to it as cards with their properties", async ({ page }) => {
    await page.goto("/app/workspace/alpha/LOE_1");
    await expect(page.locator(".rel-heading", { hasText: "question:motivates" })).toBeVisible();
    const question = page.locator(".panel", {
      has: page.locator(".card-head", { hasText: "Q_1" }),
    });
    await expect(question.getByText("alpha question")).toBeVisible();
    await expect(page.locator(".card-head", { hasText: "EU_1" })).toBeVisible();
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

  test("while its response is on its way, the page keeps its layout with placeholder rows", async ({
    page,
  }) => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/workspace/alpha/EU_1?depth=2", async (route) => {
      await held;
      await route.continue();
    });
    await page.goto("/app/workspace/alpha/EU_1");
    await expect(header(page)).toHaveText("EU_1");
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("status", { name: "Loading the properties" })).toBeVisible();
    release();
    await expect(page.locator(".detail .kv .k", { hasText: "role" })).toBeVisible();
    await expect(page.getByRole("status", { name: "Loading the properties" })).toHaveCount(0);
  });

  test("the Debug tab shows the response and the record's events", async ({ page }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await page.getByRole("tab", { name: "Debug" }).click();
    await expect(page).toHaveURL(/tab=debug/);
    await expect(page.locator(".ev").first()).toBeVisible();
    await page.getByRole("button", { name: "Show or hide the response" }).click();
    await expect(page.locator("pre.jsonview")).toContainText("alpha question");
  });

  test("an unknown tab in the address opens the overview", async ({ page }) => {
    await page.goto("/app/workspace/alpha/Q_1?tab=nonsense");
    await expect(header(page)).toHaveText("Q_1");
    await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
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

test.describe("the graph", () => {
  test("draws the graph on the canvas", async ({ page }) => {
    await page.goto("/app/workspace/alpha/LOE_1");
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

  test("the camera faces the open resource: its node is drawn in the lower-left quadrant", async ({
    page,
  }) => {
    await page.goto("/app/workspace/alpha/LOE_1");
    await expect(header(page)).toHaveText("LOE_1");
    // A node is a filled disc several pixels across; an edge or a label cannot fill a 5×5 block.
    const anchorFilled = () =>
      page.locator("#stage").evaluate((el) => {
        const c = el as HTMLCanvasElement;
        const data = c
          .getContext("2d")
          ?.getImageData(
            Math.floor(c.width * 0.25) - 2,
            Math.floor(c.height * 0.75) - 2,
            5,
            5,
          ).data;
        if (!data) return false;
        for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) < 250) return false;
        return true;
      });
    await expect.poll(anchorFilled).toBe(true);
    await page.locator(".card-head", { hasText: "EU_1" }).click();
    await expect(header(page)).toHaveText("EU_1");
    await expect.poll(anchorFilled).toBe(true);
  });

  test("the colour toggle switches, and there is no 2D view or standing overlay", async ({
    page,
  }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await expect(page.locator("#stage.orbit")).toBeVisible();
    await expect(page.locator("[data-view]")).toHaveCount(0);
    const temporal = page.locator('[data-overlay="temporal"]');
    await temporal.click();
    await expect(temporal).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-overlay="standing"]')).toHaveCount(0);
  });

  test("sits above the open resource, and stays folded as another resource opens", async ({
    page,
  }) => {
    await page.goto("/app/workspace/alpha/LOE_1");
    await expect(header(page)).toHaveText("LOE_1");
    await expect(page.locator("#stage")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Graph" })).toHaveCount(0);

    await page.getByRole("button", { name: "Show or hide the graph" }).click();
    await expect(page.locator("#stage")).toBeHidden();
    await page.locator(".card-head", { hasText: "Q_1" }).click();
    await expect(header(page)).toHaveText("Q_1");
    await expect(page.locator("#stage")).toBeHidden();
    await page.getByRole("button", { name: "Show or hide the graph" }).click();
    await expect(page.locator("#stage")).toBeVisible();
  });

  test("a node opens its resource, and that resource's relations join the graph", async ({
    page,
  }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await expect(node(page, "LOE_1 (LineOfEnquiry)")).toBeVisible();
    await expect(node(page, "EU_1 (EvidenceUnit)")).toHaveCount(0);
    await node(page, "LOE_1 (LineOfEnquiry)").press("Enter");
    await expect(header(page)).toHaveText("LOE_1");
    await expect(page).toHaveURL(/\/app\/workspace\/alpha\/LOE_1/);
    await expect(node(page, "EU_1 (EvidenceUnit)")).toBeVisible();
    await expect(node(page, "Q_1 (Question)")).toBeVisible();
  });

  test("an opened act is drawn as its subject, with no node for the act", async ({ page }) => {
    await page.goto("/app/workspace/alpha/act/1");
    await expect(header(page)).toHaveText("1");
    await expect(node(page, "Q_1 (Question)")).toBeVisible();
    await expect(node(page, "LOE_1 (LineOfEnquiry)")).toBeVisible();
    await expect(node(page, /\(Act\)$/)).toHaveCount(0);
  });

  test("Reset forgets what was opened before the open resource", async ({ page }) => {
    await page.goto(`/app/workspace/alpha/Q_2?${list("/workspace/alpha/question")}`);
    await expect(header(page)).toHaveText("Q_2");
    await item(page, "Q_1").click();
    await expect(header(page)).toHaveText("Q_1");
    await expect(node(page, "Q_2 (Question)")).toBeVisible();
    await expect(node(page, "LOE_1 (LineOfEnquiry)")).toBeVisible();

    await page.getByRole("button", { name: "Reset" }).click();
    await expect(node(page, "Q_2 (Question)")).toHaveCount(0);
    await expect(node(page, "Q_1 (Question)")).toBeVisible();
    await expect(node(page, "LOE_1 (LineOfEnquiry)")).toBeVisible();
  });

  test("an address with the old graph tab opens the overview", async ({ page }) => {
    await page.goto("/app/workspace/alpha/Q_1?tab=graph");
    await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator("#stage")).toBeVisible();
  });
});

test.describe("playback", () => {
  const play = (page: import("@playwright/test").Page) =>
    page.locator(".graph-card").getByRole("button", { name: "Play", exact: true });
  const pause = (page: import("@playwright/test").Page) =>
    page.locator(".graph-card").getByRole("button", { name: "Pause", exact: true });

  test("opens, one act at a time, each later act's subject, then stops", async ({
    page,
    errors,
  }) => {
    // Q_1 was posed by act 1. Act 2's subject is NOTE_1, which the graph does not hold, and
    // act 3's subject is LOE_1.
    await page.goto("/app/workspace/alpha/Q_1");
    await expect(header(page)).toHaveText("Q_1");
    await play(page).click();
    await expect(pause(page)).toBeVisible();
    await expect(page).toHaveURL(/\/NOTE_1/, { timeout: 10_000 });
    await expect(page.locator(".fetch-error")).toContainText("404");
    await expect(header(page)).toHaveText("LOE_1", { timeout: 10_000 });
    await expect(page.locator(".playback-status")).toHaveText("No later act.", {
      timeout: 10_000,
    });
    await expect(play(page)).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/NOTE_1/);
    // The browser reports the 404 for NOTE_1 as a console error.
    expect(errors.every((e) => e.includes("404"))).toBe(true);
    errors.length = 0;
  });

  test("from the acts collection, each step opens the next act, and the graph draws its subject", async ({
    page,
    errors,
  }) => {
    await page.goto("/app/workspace/alpha/act");
    await expect(page.locator(".sidebar .res-item")).toHaveCount(3);
    await play(page).click();
    await expect(header(page)).toHaveText("1", { timeout: 10_000 });
    await expect(page.locator(".sidebar .res-item.active")).toContainText("pose Q_1");
    await expect(node(page, "Q_1 (Question)")).toBeVisible();
    await expect(header(page)).toHaveText("2", { timeout: 10_000 });
    await expect(header(page)).toHaveText("3", { timeout: 10_000 });
    await expect(page.locator(".sidebar .res-item.active")).toContainText("LOE_1");
    await expect(page.locator(".playback-status")).toHaveText("No later act.", {
      timeout: 10_000,
    });
    await expect(node(page, "LOE_1 (LineOfEnquiry)")).toBeVisible();
    await expect(node(page, /\(Act\)$/)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${list("/workspace/alpha/act")}`));
    // Act 2's subject, NOTE_1, is not in the graph: the browser reports its 404.
    expect(errors.every((e) => e.includes("404"))).toBe(true);
    errors.length = 0;
  });

  test("the Acts list follows playback past the rows it has loaded", async ({ page, errors }) => {
    await page.goto(`/app/workspace/alpha/act/1?${list("/workspace/alpha/act?limit=1")}`);
    await expect(page.locator(".sidebar .res-item")).toHaveCount(1);
    await play(page).click();
    await expect(page.locator(".playback-status")).toHaveText("No later act.", {
      timeout: 10_000,
    });
    await expect(page.locator(".sidebar .res-item")).toHaveCount(3);
    await expect(page.locator(".sidebar .res-item.active")).toContainText("LOE_1");
    // Act 2's subject, NOTE_1, is not in the graph: the browser reports its 404.
    expect(errors.every((e) => e.includes("404"))).toBe(true);
    errors.length = 0;
  });

  test("the act's name under the canvas does not move the header's controls", async ({
    page,
    errors,
  }) => {
    await page.goto("/app/workspace/alpha/act");
    // A web font arriving late changes the button's width by a fraction of a pixel.
    await page.evaluate(() => document.fonts.ready);
    const kind = page.locator('[data-overlay="structural"]');
    const box = async () => {
      const b = await kind.boundingBox();
      return b && [b.x, b.y, b.width, b.height].map(Math.round);
    };
    const before = await box();
    await expect(page.locator(".graph-foot").getByRole("button", { name: "Play" })).toBeVisible();
    await play(page).click();
    await expect(page.locator(".graph-foot .playback-status")).toHaveText("pose Q_1", {
      timeout: 10_000,
    });
    expect(await box()).toEqual(before);
    await pause(page).click();
    // Act 2's subject, NOTE_1, may have been fetched: the browser reports its 404.
    expect(errors.every((e) => e.includes("404"))).toBe(true);
    errors.length = 0;
  });

  test("from an act, playback starts after that act", async ({ page, errors }) => {
    await page.goto("/app/workspace/alpha/act/2");
    await expect(header(page)).toHaveText("2");
    await play(page).click();
    await expect(header(page)).toHaveText("3", { timeout: 10_000 });
    await expect(page.locator(".playback-status")).toHaveText("No later act.", {
      timeout: 10_000,
    });
    // Act 2's subject, NOTE_1, is not in the graph: the browser reports its 404.
    expect(errors.every((e) => e.includes("404"))).toBe(true);
    errors.length = 0;
  });

  test("while playing, the corner card shows what playback opened, until the pointer is on the canvas", async ({
    page,
  }) => {
    // Playback stays on act 1 while the page after it is held.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      (url) =>
        url.pathname.endsWith("/workspace/alpha/act") && url.searchParams.get("since") === "1",
      async (route) => {
        await held;
        await route.continue();
      },
    );
    await page.goto("/app/workspace/alpha/act");
    await play(page).click();
    await expect(header(page)).toHaveText("1", { timeout: 10_000 });
    const card = page.locator("#popover");
    await expect(card.locator(".cid")).toHaveText("Q_1");

    const stage = await page.locator("#stage").boundingBox();
    if (stage === null) throw new Error("the canvas has no box");
    await page.mouse.move(stage.x + stage.width - 10, stage.y + 10);
    await expect(card).toBeHidden();
    await page.mouse.move(stage.x + stage.width / 2, stage.y - 20);
    await expect(card.locator(".cid")).toHaveText("Q_1");

    await pause(page).click();
    await expect(card).toBeHidden();
    release();
  });

  test("stops when the reader opens something else", async ({ page }) => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/workspace/alpha/act?*", async (route) => {
      await held;
      await route.continue();
    });
    await page.goto("/app/workspace/alpha/Q_1");
    await play(page).click();
    await expect(pause(page)).toBeVisible();
    await page.locator(".card-head", { hasText: "LOE_1" }).click();
    await expect(header(page)).toHaveText("LOE_1");
    await expect(play(page)).toBeVisible();
    release();
    await page.waitForTimeout(2_000);
    await expect(header(page)).toHaveText("LOE_1");
  });

  test("from a resource no act records, says so", async ({ page }) => {
    await page.goto("/app/workspace/alpha/EU_1");
    await expect(header(page)).toHaveText("EU_1");
    await play(page).click();
    await expect(page.locator(".playback-status")).toHaveText("No act records EU_1.");
    await expect(play(page)).toBeVisible();
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
