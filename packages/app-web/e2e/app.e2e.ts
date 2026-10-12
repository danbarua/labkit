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
      // Closing an agent connection ends its event stream and then sends DELETE; the ACP server
      // forgets a connection whose stream has ended, so the DELETE can be answered 404, which the
      // browser logs. The connection is closed either way. Each such answer excuses one log line.
      let closed404 = 0;
      page.on("response", (res) => {
        if (
          res.request().method() === "DELETE" &&
          res.status() === 404 &&
          res.url().endsWith("/acp")
        )
          closed404++;
      });
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
      page.on("console", (msg) => {
        const { url } = msg.location();
        // A browser showing a JSON document asks for a favicon, and there is none to give.
        if (msg.type() === "error" && !url.endsWith("/favicon.ico")) {
          errors.push(`console: ${msg.text()} ${url}`);
        }
      });
      await use(errors);
      const left = errors.filter(
        (e) =>
          !(closed404 > 0 && e.includes("404 (Not Found)") && e.endsWith("/acp") && closed404--),
      );
      expect(left, "errors in the browser").toEqual([]);
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

  test("the LabKit name in the top bar leads back to the workspaces", async ({ page }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await page.getByRole("button", { name: "LabKit" }).click();
    await expect(page).toHaveURL(/\/app\/$/);
    await expect(page.getByText("Pick a type on the left")).toBeVisible();
  });

  test("the top bar has the LabKit name and no sidebar, history or filter controls", async ({
    page,
  }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    const bar = page.locator(".topbar");
    await expect(bar.getByRole("button", { name: "LabKit" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Show or hide the sidebar" })).toHaveCount(0);
    await expect(bar.getByRole("button", { name: "Back" })).toHaveCount(0);
    await expect(bar.getByRole("button", { name: "Forward" })).toHaveCount(0);
    await expect(bar.getByRole("button", { name: "Entry point" })).toHaveCount(0);
    await expect(bar.getByRole("textbox")).toHaveCount(0);
    await expect(bar).not.toContainText("Trace Console");
    await expect(bar).not.toContainText("live");
  });

  test("the top bar links to no gallery or sessions page", async ({ page }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    const bar = page.locator(".topbar");
    await expect(bar.getByRole("button", { name: "LabKit" })).toBeVisible();
    await expect(bar.getByRole("link", { name: "gallery" })).toHaveCount(0);
    await expect(bar.getByRole("link", { name: "sessions" })).toHaveCount(0);
  });

  test("the gallery draws every tile without an error, the failed turns' included", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "dev", "the gallery exists only in development");
    await page.goto("/app/gallery");
    await expect(page.locator("section[aria-label]").first()).toBeVisible();
    // A failed turn's tile drew again on every render until its indicator kept an equal activity.
    await page.waitForTimeout(1500);
  });

  test("the sessions page has the same top bar as the Trace Console, with the theme button at its right", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "dev", "the sessions page exists only in development");
    await page.goto("/app/gallery/sessions");
    const bar = page.locator(".topbar");
    await expect(bar.getByRole("link", { name: "LabKit" })).toBeVisible();
    const theme = bar.getByRole("button", { name: /^Theme:/ });
    await expect(theme).toBeVisible();
    const barBox = await bar.boundingBox();
    const themeBox = await theme.boundingBox();
    expect(
      (barBox?.x ?? 0) + (barBox?.width ?? 0) - ((themeBox?.x ?? 0) + (themeBox?.width ?? 0)),
    ).toBeLessThan(24);
    expect(await bar.evaluate((e) => getComputedStyle(e).height)).toBe("52px");
  });

  test("the Items filter narrows the listed items", async ({ page }) => {
    await page.goto(`/app/workspace/alpha/Q_1?${list("/workspace/alpha/question")}`);
    await expect(item(page, "Q_2")).toBeVisible();
    await page.getByRole("textbox", { name: "Filter the items" }).fill("Q_2");
    await expect(item(page, "Q_2")).toBeVisible();
    await expect(item(page, "Q_1")).toHaveCount(0);
  });

  test("in a short window, Collections takes at most 40% of Record Explorer and Items keeps the rest", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 520 });
    await page.goto(`/app/workspace/alpha/Q_1?${list("/workspace/alpha/question")}`);
    const panes = page.locator("aside.sidebar .explorer-body .sidebar-section");
    await expect(panes).toHaveCount(2);
    const height = async (locator: import("@playwright/test").Locator) =>
      (await locator.boundingBox())?.height ?? 0;
    const body = page.locator("aside.sidebar .explorer-body");
    await expect
      .poll(async () => (await height(panes.nth(0))) <= 0.4 * (await height(body)) + 2)
      .toBe(true);
    expect(await height(panes.nth(1))).toBeGreaterThanOrEqual(120);
    expect(await height(panes.nth(1))).toBeGreaterThan(await height(panes.nth(0)));
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

test.describe("the sidebar", () => {
  const sidebar = (page: import("@playwright/test").Page) => page.locator("aside.sidebar");
  const toggle = (page: import("@playwright/test").Page) =>
    page.getByRole("button", { name: "Show or hide the sidebar" });
  const explorer = (page: import("@playwright/test").Page, name: string) =>
    page.getByRole("button", { name, exact: true });

  test("the rail stays when the sidebar is hidden; its section buttons fold or open sections and show the sidebar", async ({
    page,
  }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    const rail = page.getByRole("navigation", { name: "Sidebar sections" });
    await expect(rail).toBeVisible();
    await toggle(page).click();
    await expect(sidebar(page)).toBeHidden();
    await expect(rail).toBeVisible();
    const files = rail.getByRole("button", { name: "Open File Explorer" });
    await files.click();
    await expect(sidebar(page)).toBeVisible();
    await expect(files).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "File Explorer" })).toBeVisible();
    await files.click();
    await expect(files).toHaveAttribute("aria-pressed", "false");
    await expect(
      page.getByRole("region", { name: "File Explorer" }).locator(".explorer-body"),
    ).toHaveCount(0);
    // A folded section stays as tall as its header.
    const folded = page.getByRole("region", { name: "File Explorer" });
    await expect(folded.getByRole("button", { name: "File Explorer", exact: true })).toBeVisible();
    await expect.poll(async () => (await folded.boundingBox())?.height ?? 0).toBeGreaterThan(30);
  });

  test("at full width, the toggle hides and shows the sidebar, and a reload keeps it hidden", async ({
    page,
  }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await expect(sidebar(page)).toBeVisible();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    await toggle(page).click();
    await expect(sidebar(page)).toBeHidden();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await page.reload();
    await expect(header(page)).toHaveText("Q_1");
    await expect(sidebar(page)).toBeHidden();
    await toggle(page).click();
    await expect(sidebar(page)).toBeVisible();
  });

  test("Record Explorer folds Collections and Items away, and a reload keeps it folded", async ({
    page,
  }) => {
    await page.goto(`/app/workspace/alpha/Q_1?${list("/workspace/alpha/question")}`);
    await expect(item(page, "Q_1")).toBeVisible();
    await explorer(page, "Record Explorer").click();
    await expect(explorer(page, "Record Explorer")).toHaveAttribute("aria-expanded", "false");
    await expect(item(page, "Q_1")).toBeHidden();
    await expect(row(page, "Question")).toBeHidden();
    await page.reload();
    await expect(header(page)).toHaveText("Q_1");
    await expect(item(page, "Q_1")).toBeHidden();
    await explorer(page, "Record Explorer").click();
    await expect(item(page, "Q_1")).toBeVisible();
  });

  test("File and Source Explorers are disabled, and say why: no workspace is open, or the open one serves none", async ({
    page,
  }) => {
    await page.goto("/app/");
    await expect(row(page, "alpha")).toBeVisible();
    await expect(explorer(page, "File Explorer")).toBeDisabled();
    await expect(explorer(page, "File Explorer")).toHaveAccessibleDescription(
      "Open a workspace to browse its files.",
    );
    await expect(explorer(page, "Source Explorer")).toBeDisabled();
    await expect(explorer(page, "Source Explorer")).toHaveAccessibleDescription(
      "Open a workspace to browse its history.",
    );
    // The test stack maps a repository to alpha and none to beta.
    await page.goto("/app/workspace/beta/Q_1");
    await expect(header(page)).toHaveText("Q_1");
    await expect(explorer(page, "File Explorer")).toHaveAccessibleDescription(
      "beta serves no files.",
    );
    await expect(explorer(page, "Source Explorer")).toHaveAccessibleDescription(
      "beta serves no history.",
    );
    await page.goto("/app/workspace/alpha/Q_1");
    await expect(header(page)).toHaveText("Q_1");
    await expect(explorer(page, "File Explorer")).toBeEnabled();
    await expect(explorer(page, "Source Explorer")).toBeEnabled();
  });

  test("File Explorer shows the files as a tree; a directory opens in place, and a file opens on the page", async ({
    page,
  }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await explorer(page, "File Explorer").click();
    const tree = page.locator(".file-tree");
    await expect(tree.locator(".tree-row .tree-name")).toHaveText([
      "docs",
      "notes",
      "src",
      "big.txt",
      "pixel.png",
      "readme-link",
      "README.md",
    ]);
    await tree.getByRole("button", { name: "src" }).click();
    await expect(tree.getByRole("button", { name: "src" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await tree.getByRole("button", { name: "a.ts" }).click();
    await expect(header(page)).toHaveText("a.ts");
    await expect(page).toHaveURL(/\/app\/workspace\/alpha\/file\/src\/a\.ts/);
    await expect(page.locator(".file-card .lk-code-text")).toHaveText("1export const a = 2;");
    await expect(tree.locator(".tree-row.active")).toHaveText("a.ts");
  });

  test("File Explorer draws each file's icon by its media type, and folders as folders", async ({
    page,
  }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await explorer(page, "File Explorer").click();
    const tree = page.locator(".file-tree");
    const kind = (name: string) =>
      tree.getByRole("button", { name, exact: true }).locator(".tree-icon");
    await expect(kind("src")).toHaveAttribute("data-kind", "folder");
    await expect(kind("README.md")).toHaveAttribute("data-kind", "markdown");
    await expect(kind("pixel.png")).toHaveAttribute("data-kind", "image");
    await expect(kind("big.txt")).toHaveAttribute("data-kind", "text");
    // The API's table names no media type for a name with no extension.
    await expect(kind("readme-link")).toHaveAttribute("data-kind", "other");
    await tree.getByRole("button", { name: "src" }).click();
    await expect(kind("a.ts")).toHaveAttribute("data-kind", "typescript");
  });

  test("in File Explorer, a box marks the open file, slides to the next one opened, and moves with it when a folder above opens", async ({
    page,
  }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await explorer(page, "File Explorer").click();
    const tree = page.locator(".file-tree");
    const box = tree.locator(".active-box.outline");
    const file = (name: string) => tree.getByRole("button", { name, exact: true });
    const top = async (locator: import("@playwright/test").Locator) =>
      Math.round((await locator.boundingBox())?.y ?? -1);
    await file("README.md").click();
    await expect(header(page)).toHaveText("README.md");
    await expect.poll(async () => (await top(box)) - (await top(file("README.md")))).toBe(0);
    await file("big.txt").click();
    await expect(header(page)).toHaveText("big.txt");
    await expect(tree.locator(".active-box.fill")).toHaveClass(/filled/);
    await expect.poll(async () => (await top(box)) - (await top(file("big.txt")))).toBe(0);
    await file("notes").click();
    await expect(file("plan.md")).toBeVisible();
    await expect.poll(async () => (await top(box)) - (await top(file("big.txt")))).toBe(0);
  });

  test("in Source Explorer, a box marks the open commit and slides to the next one opened", async ({
    page,
  }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await explorer(page, "Source Explorer").click();
    const history = page.locator(".history");
    const box = history.locator(".active-box.outline");
    const commit = (subject: string) => history.locator(".commit-row", { hasText: subject });
    const top = async (locator: import("@playwright/test").Locator) =>
      Math.round((await locator.boundingBox())?.y ?? -1);
    await commit("Add a picture and a guide").click();
    await expect(commit("Add a picture and a guide")).toHaveClass(/active/);
    await expect
      .poll(async () => (await top(box)) - (await top(commit("Add a picture and a guide"))))
      .toBe(0);
    // The box has rounded corners, as the boxes in the other lists do.
    expect(await box.evaluate((e) => getComputedStyle(e).borderTopLeftRadius)).toBe("6px");
    await commit("Side work").click();
    await expect(commit("Side work")).toHaveClass(/active/);
    await expect(history.locator(".active-box.fill")).toHaveClass(/filled/);
    await expect.poll(async () => (await top(box)) - (await top(commit("Side work")))).toBe(0);
  });

  test("Source Explorer lists every branch's commits, newest first; a commit opens with its changed files and diff", async ({
    page,
  }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await explorer(page, "Source Explorer").click();
    const history = page.locator(".history .commit-row .subject");
    await expect(history).toHaveText([
      "Merge side",
      "Add a picture and a guide",
      "Drop the blob, add a big file",
      "Side work",
      "Change a, plan the work",
      "Start the project",
    ]);
    await history.filter({ hasText: "Change a, plan the work" }).click();
    await expect(page.locator(".header-type")).toHaveText("Commit");
    await expect(header(page)).toHaveText(/^[0-9a-f]{7}$/);
    const changes = page.locator(".kv:has(.change-status)");
    await expect(changes).toHaveText([
      "Addednotes/latin1.txt",
      "Addednotes/plan.md",
      "Addedreadme-link",
      "Modifiedsrc/a.ts",
    ]);
    const diff = page.locator(".diff-card", { hasText: "src/a.ts" });
    await expect(diff.locator(".lk-diff-line.remove")).toHaveText(["- export const a = 1;"]);
    await expect(diff.locator(".lk-diff-line.add")).toHaveText(["+ export const a = 2;"]);
    // A changed file opens as it was at that commit.
    await changes.getByRole("button", { name: "src/a.ts" }).click();
    await expect(header(page)).toHaveText("a.ts");
    await expect(page).toHaveURL(/\/commit\/[0-9a-f]{40}\/file\/src\/a\.ts/);
    await expect(page.locator(".file-card .lk-code-text")).toHaveText("1export const a = 2;");
  });

  test("File and Source Explorers are enabled once Record Explorer lists a workspace, before any record is open", async ({
    page,
  }) => {
    await page.goto(`/app/?${list("/workspace/alpha")}`);
    await expect(row(page, "Question")).toBeVisible();
    await expect(explorer(page, "File Explorer")).toBeEnabled();
    await expect(explorer(page, "Source Explorer")).toBeEnabled();
  });

  test("with all three sections open, Record Explorer keeps its Items pane inside the sidebar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`/app/workspace/alpha/Q_1?${list("/workspace/alpha/question")}`);
    await explorer(page, "File Explorer").click();
    await explorer(page, "Source Explorer").click();
    await expect(page.locator(".file-tree .tree-row").first()).toBeVisible();
    const bottom = await sidebar(page).evaluate((el) => el.getBoundingClientRect().bottom);
    const items = page.locator(".explorer-body .sidebar-section.grow");
    const box = await items.evaluate((el) => el.getBoundingClientRect());
    expect(box.height).toBeGreaterThanOrEqual(100);
    expect(box.bottom).toBeLessThanOrEqual(bottom + 1);
    await expect(item(page, "Q_1")).toBeInViewport();
  });

  test("dragging the border between two open sections moves height from one to the other, and a reload keeps it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/app/workspace/alpha/Q_1");
    await explorer(page, "File Explorer").click();
    await explorer(page, "Source Explorer").click();
    // The sections' shares settle after their opening transition.
    await expect(page.locator(".explorer.moving")).toHaveCount(0);
    const section = (name: string) => sidebar(page).getByRole("region", { name });
    const height = async (name: string) =>
      Math.round((await section(name).boundingBox())?.height ?? -1);
    const heights = async () => ({
      files: await height("File Explorer"),
      history: await height("Source Explorer"),
      records: await height("Record Explorer"),
    });
    const border = page.getByRole("separator", {
      name: "Resize File Explorer and Source Explorer",
    });
    const before = await heights();
    const at = await border.boundingBox();
    if (at === null) throw new Error("the border has no box");
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2 + 60, { steps: 5 });
    await page.mouse.up();
    const dragged = await heights();
    expect(Math.abs(dragged.files - (before.files + 60))).toBeLessThanOrEqual(2);
    expect(Math.abs(dragged.history - (before.history - 60))).toBeLessThanOrEqual(2);
    expect(dragged.records).toBe(before.records);

    await border.focus();
    await page.keyboard.press("ArrowUp");
    const pressed = await heights();
    expect(Math.abs(pressed.files - (dragged.files - 16))).toBeLessThanOrEqual(2);

    await page.reload();
    // File Explorer takes its share once the workspace's index arrives, after it is first drawn.
    await expect
      .poll(async () => Math.abs((await heights()).files - pressed.files))
      .toBeLessThanOrEqual(2);
  });

  test("a double-click on a border returns the two sections it divides to their initial proportion, and no other border moves", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/app/workspace/alpha/Q_1");
    await explorer(page, "File Explorer").click();
    await explorer(page, "Source Explorer").click();
    // The sections' shares settle after their opening transition.
    await expect(page.locator(".explorer.moving")).toHaveCount(0);
    const section = (name: string) => sidebar(page).getByRole("region", { name });
    const height = async (name: string) =>
      Math.round((await section(name).boundingBox())?.height ?? -1);
    const heights = async () => ({
      files: await height("File Explorer"),
      history: await height("Source Explorer"),
      records: await height("Record Explorer"),
    });
    const upper = page.getByRole("separator", { name: "Resize File Explorer and Source Explorer" });
    const lower = page.getByRole("separator", {
      name: "Resize Source Explorer and Record Explorer",
    });
    const drag = async (border: typeof upper, by: number) => {
      const at = await border.boundingBox();
      if (at === null) throw new Error("the border has no box");
      await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
      await page.mouse.down();
      await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2 + by, { steps: 5 });
      await page.mouse.up();
    };
    await drag(upper, 60);
    await drag(lower, 40);
    const dragged = await heights();
    expect(dragged.files - dragged.history).toBeGreaterThan(60);

    await upper.dblclick();
    const reset = await heights();
    expect(Math.abs(reset.files - reset.history)).toBeLessThanOrEqual(2);
    expect(
      Math.abs(reset.files + reset.history - (dragged.files + dragged.history)),
    ).toBeLessThanOrEqual(2);
    expect(reset.records).toBe(dragged.records);

    await lower.dblclick();
    const both = await heights();
    expect(Math.abs(both.records - 2 * both.history)).toBeLessThanOrEqual(3);
    expect(both.files).toBe(reset.files);
  });

  test("Home on a focused border moves it up until the section above is 72 px high, and End moves it down until the section below is", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/app/workspace/alpha/Q_1");
    await explorer(page, "File Explorer").click();
    await explorer(page, "Source Explorer").click();
    // The sections' shares settle after their opening transition.
    await expect(page.locator(".explorer.moving")).toHaveCount(0);
    const section = (name: string) => sidebar(page).getByRole("region", { name });
    const height = async (name: string) =>
      Math.round((await section(name).boundingBox())?.height ?? -1);
    const heights = async () => ({
      files: await height("File Explorer"),
      history: await height("Source Explorer"),
      records: await height("Record Explorer"),
    });
    const before = await heights();
    await page.getByRole("separator", { name: "Resize File Explorer and Source Explorer" }).focus();
    await page.keyboard.press("Home");
    const home = await heights();
    expect(Math.abs(home.files - 72)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(home.files + home.history - (before.files + before.history)),
    ).toBeLessThanOrEqual(2);
    expect(home.records).toBe(before.records);

    await page.keyboard.press("End");
    const end = await heights();
    expect(Math.abs(end.history - 72)).toBeLessThanOrEqual(1);
    expect(end.records).toBe(before.records);
  });

  test("Source Explorer draws the branches' lanes and opens on HEAD's branch; picking another outlines its tip", async ({
    page,
  }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await explorer(page, "Source Explorer").click();
    const picker = page.getByRole("combobox", { name: "Branch" });
    await expect(picker.locator("option:checked")).toHaveText(/\(HEAD\)$/);
    await expect(page.locator(".history .timeline-row.tip .subject")).toHaveText("Merge side");
    // The merge draws two lines down, to its two parents.
    const merge = page.locator(".history .timeline-row", { hasText: "Merge side" });
    await expect(merge.locator("svg line")).toHaveCount(2);
    await expect(page.locator(".history .ref-pill", { hasText: "origin/main" })).toBeVisible();
    await picker.selectOption("side");
    await expect(page.locator(".history .timeline-row.tip .subject")).toHaveText("Side work");
  });

  test("a picture is shown as itself, from its committed bytes", async ({ page }) => {
    await page.goto("/app/workspace/alpha/file/pixel.png");
    const picture = page.locator(".file-card img.file-image");
    await expect(picture).toHaveAttribute("src", "/workspace/alpha/raw/pixel.png");
    await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  });

  test("a markdown file is rendered, with its picture from the repository, and its source a toggle away", async ({
    page,
  }) => {
    await page.goto("/app/workspace/alpha/file/docs/guide.md");
    const card = page.locator(".file-card");
    await expect(card.locator(".file-markdown h1")).toHaveText("Guide");
    const picture = card.locator(".file-markdown img");
    await expect(picture).toHaveAttribute("src", "/workspace/alpha/raw/pixel.png");
    await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
    await expect(card.getByRole("link", { name: "the web" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
    await card.getByRole("button", { name: "Source" }).click();
    await expect(card.locator(".lk-code-text")).toContainText("# Guide");
    await expect(card.locator(".file-markdown")).toHaveCount(0);
    await card.getByRole("button", { name: "Rendered" }).click();
    await expect(card.locator(".file-markdown h1")).toHaveText("Guide");
  });

  test("a link in a markdown file to another file opens that file on the page", async ({
    page,
  }) => {
    await page.goto("/app/workspace/alpha/file/docs/guide.md");
    await page.locator(".file-markdown").getByRole("link", { name: "the plan" }).click();
    await expect(header(page)).toHaveText("plan.md");
    await expect(page).toHaveURL(/\/app\/workspace\/alpha\/file\/notes\/plan\.md/);
    expect(page.context().pages()).toHaveLength(1);
  });

  test("a binary file is a note with a download link", async ({ page }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await explorer(page, "Source Explorer").click();
    await page.locator(".history .commit-row", { hasText: "Start the project" }).click();
    await page
      .locator(".kv:has(.change-status)")
      .getByRole("button", { name: "data/blob.bin" })
      .click();
    await expect(header(page)).toHaveText("blob.bin");
    const card = page.locator(".file-card");
    await expect(card.locator(".card-note")).toContainText("A binary file of 6 bytes.");
    await expect(card.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      /^\/workspace\/alpha\/commit\/[0-9a-f]{40}\/raw\/data\/blob\.bin$/,
    );
  });

  test("a commit's changed files and the records its acts changed join the graph, connected to it", async ({
    page,
  }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await explorer(page, "Source Explorer").click();
    await page.locator(".history .commit-row", { hasText: "Start the project" }).click();
    await expect(page.locator(".header-type")).toHaveText("Commit");
    await expect(node(page, "a.ts (File)")).toBeVisible();
    await expect(node(page, "README.md (File)")).toBeVisible();
    // Act 1 posed Q_1 against this commit; the graph draws the act as its subject.
    await expect(node(page, "Q_1 (Question)")).toBeVisible();
    await expect(node(page, /\(Act\)$/)).toHaveCount(0);
  });

  test("the commits that changed a file join the graph, and its directory does not", async ({
    page,
  }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await explorer(page, "File Explorer").click();
    const tree = page.locator(".file-tree");
    await tree.getByRole("button", { name: "src" }).click();
    await tree.getByRole("button", { name: "a.ts" }).click();
    await expect(header(page)).toHaveText("a.ts");
    await expect(node(page, /^[0-9a-f]{7} \(Commit\)$/)).toHaveCount(2);
    await expect(node(page, /\(Directory\)$/)).toHaveCount(0);
  });

  test("Record Explorer lists the workspace's records and acts, and leaves files and history to their own sections", async ({
    page,
  }) => {
    await page.goto(`/app/?${list("/workspace/alpha")}`);
    await expect(row(page, "Question")).toBeVisible();
    await expect(row(page, "Act")).toBeVisible();
    await expect(row(page, "File")).toHaveCount(0);
    await expect(row(page, "Commit")).toHaveCount(0);
  });

  test("in a narrow window, the toggle opens the sidebar over the page, and opening a resource closes it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto(`/app/workspace/alpha/Q_1?${list("/workspace/alpha/question")}`);
    await expect(header(page)).toHaveText("Q_1");
    await expect(sidebar(page)).not.toBeInViewport();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await toggle(page).click();
    await expect(sidebar(page)).toBeInViewport();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    await item(page, "Q_2").click();
    await expect(header(page)).toHaveText("Q_2");
    await expect(sidebar(page)).not.toBeInViewport();
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

  test("the browser's back and forward step through what was opened", async ({ page }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await page.locator(".card-head", { hasText: "LOE_1" }).click();
    await expect(header(page)).toHaveText("LOE_1");

    await page.goBack();
    await expect(header(page)).toHaveText("Q_1");
    await page.goForward();
    await expect(header(page)).toHaveText("LOE_1");
  });

  test("opening the resource that is open adds no history entry", async ({ page }) => {
    await page.goto(`/app/workspace/alpha/Q_1?${list("/workspace/alpha/question")}`);
    await expect(header(page)).toHaveText("Q_1");
    const entries = await page.evaluate(() => history.length);
    await item(page, "Q_1").click();
    await expect(header(page)).toHaveText("Q_1");
    expect(await page.evaluate(() => history.length)).toBe(entries);
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
    await expect(page.locator(".response-card .lk-code-text")).toContainText("alpha question");
  });

  test("Overview, Debug and Reload sit on the header's line, at its right", async ({ page }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await expect(header(page)).toHaveText("Q_1");
    const middle = async (locator: import("@playwright/test").Locator) => {
      const b = await locator.boundingBox();
      return b === null ? -1 : b.y + b.height / 2;
    };
    const handle = await middle(header(page));
    for (const control of [
      page.getByRole("tab", { name: "Overview" }),
      page.getByRole("tab", { name: "Debug" }),
      page.getByRole("button", { name: "Reload from the API" }),
    ])
      expect(Math.abs((await middle(control)) - handle)).toBeLessThanOrEqual(6);
    const right = async (locator: import("@playwright/test").Locator) => {
      const b = await locator.boundingBox();
      return b === null ? -1 : b.x + b.width;
    };
    expect(
      Math.abs(
        (await right(page.getByRole("button", { name: "Reload from the API" }))) -
          (await right(page.locator(".header-top"))),
      ),
    ).toBeLessThanOrEqual(1);
  });

  test("an event draws the records its change names as chips: the open one marked, the others opening theirs", async ({
    page,
    errors,
  }) => {
    await page.goto("/app/workspace/alpha/Q_1?tab=debug");
    const created = page.locator(".ev", { hasText: "#1.1" });
    await expect(created.locator(".mention.current")).toHaveText("Q_1");
    // Act 2 drew an edge from NOTE_1 to Q_1: its ends either side of its label, on one line.
    const edge = page.locator(".ev", { hasText: "#2.2" });
    await expect(edge.locator(".ev-kind")).toHaveText(/EdgeCreated\s*NOTE_1\s*\S+\s*Q_1/);
    await expect(edge.locator(".mention.current")).toHaveText("Q_1");
    await edge.getByRole("button", { name: "NOTE_1" }).click();
    await expect(page).toHaveURL(/\/NOTE_1/);
    // The graph does not hold NOTE_1: the browser reports its 404.
    await expect(page.locator(".fetch-error")).toContainText("404");
    expect(errors.every((e) => e.includes("404"))).toBe(true);
    errors.length = 0;
  });

  test("under a record's events, the commits their acts ran against, each opening its commit", async ({
    page,
  }) => {
    // Act 1, which posed Q_1, ran against the repository's first commit.
    await page.goto("/app/workspace/alpha/Q_1?tab=debug");
    const commits = page.locator(".panel", { hasText: "Commits the acts ran against" });
    const row = commits.locator(".ev.ran-against");
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("button", { name: "#1" })).toBeVisible();
    await row.locator(".mention").click();
    await expect(page.locator(".header-type")).toHaveText("Commit");
    await expect(header(page)).toHaveText(/^[0-9a-f]{7}$/);
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

test.describe("the Items pane's open row", () => {
  const box = (page: import("@playwright/test").Page) =>
    page.locator(".res-list .active-box.outline");
  const fill = (page: import("@playwright/test").Page) =>
    page.locator(".res-list .active-box.fill");

  test("a box marks the open row, and slides to the next row opened, then fills", async ({
    page,
  }) => {
    await page.goto(`/app/workspace/alpha/Q_1?${list("/workspace/alpha/question")}`);
    await expect(fill(page)).toHaveClass(/filled/);
    const top = async (locator: import("@playwright/test").Locator) =>
      Math.round((await locator.boundingBox())?.y ?? -1);
    await expect.poll(async () => (await top(box(page))) - (await top(item(page, "Q_1")))).toBe(0);

    await item(page, "Q_2").click();
    await expect(header(page)).toHaveText("Q_2");
    await expect(fill(page)).toHaveClass(/filled/);
    await expect.poll(async () => (await top(box(page))) - (await top(item(page, "Q_2")))).toBe(0);
  });

  test("in the Collections pane, a box marks the listed collection and slides to the next", async ({
    page,
  }) => {
    await page.goto(`/app/?${list("/workspace/alpha/question")}`);
    const outline = page.locator(".type-list .active-box.outline");
    const top = async (locator: import("@playwright/test").Locator) =>
      Math.round((await locator.boundingBox())?.y ?? -1);
    await expect(outline).toBeVisible();
    expect(await top(outline)).toBe(await top(row(page, "Question")));
    await row(page, "LineOfEnquiry").click();
    await expect(page.locator(".type-list .active-box.fill")).toHaveClass(/filled/);
    await expect
      .poll(async () => (await top(outline)) - (await top(row(page, "LineOfEnquiry"))))
      .toBe(0);
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

  test("the camera faces the open resource: its node is drawn left of centre, clear of the card", async ({
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
            Math.floor(c.width * 0.35) - 2,
            Math.floor(c.height * 0.45) - 2,
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
      return b ? [b.x, b.y, b.width, b.height] : [];
    };
    const before = await box();
    await expect(page.locator(".graph-foot").getByRole("button", { name: "Play" })).toBeVisible();
    await play(page).click();
    await expect(page.locator(".graph-foot .playback-status")).toHaveText("pose Q_1", {
      timeout: 10_000,
    });
    // Within a pixel: layout rounds fractional positions differently from one frame to the next.
    const after = await box();
    expect(after).toHaveLength(4);
    for (const [i, value] of after.entries())
      expect(Math.abs(value - (before[i] ?? 0))).toBeLessThanOrEqual(1);
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

  test("from a record no act changed, says so", async ({ page }) => {
    await page.goto("/app/workspace/alpha/EU_1");
    await expect(header(page)).toHaveText("EU_1");
    await play(page).click();
    await expect(page.locator(".playback-status")).toHaveText("No act changed EU_1.");
    await expect(play(page)).toBeVisible();
  });

  test("from a commit an act ran against, plays the later acts; from one no act ran against, or a file, Play is disabled", async ({
    page,
    errors,
  }) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await page.getByRole("button", { name: "Source Explorer", exact: true }).click();
    const commit = (subject: string) => page.locator(".history .commit-row", { hasText: subject });
    // Act 1 ran against the first commit; acts 2 and 3 come after it.
    await commit("Start the project").click();
    await expect(page.locator(".header-type")).toHaveText("Commit");
    await play(page).click();
    await expect(page).toHaveURL(/\/NOTE_1/, { timeout: 10_000 });
    await expect(header(page)).toHaveText("LOE_1", { timeout: 10_000 });
    await expect(page.locator(".playback-status")).toHaveText("No later act.", {
      timeout: 10_000,
    });
    // The browser reports the 404 for NOTE_1, which the graph does not hold, as a console error.
    expect(errors.every((e) => e.includes("404"))).toBe(true);
    errors.length = 0;

    await commit("Change a, plan the work").click();
    await expect(page.locator(".header-type")).toHaveText("Commit");
    await expect(header(page)).toHaveText(/^[0-9a-f]{7}$/);
    await expect(play(page)).toBeDisabled();
    await page.getByRole("button", { name: "File Explorer", exact: true }).click();
    await page.locator(".file-tree").getByRole("button", { name: "README.md" }).click();
    await expect(header(page)).toHaveText("README.md");
    await expect(play(page)).toBeDisabled();
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

  test("in an unknown workspace, File and Source Explorers say its collections did not load", async ({
    page,
    errors,
  }) => {
    await page.goto("/app/workspace/nowhere/Q_1");
    await expect(page.locator(".fetch-error")).toContainText("404");
    for (const name of ["File Explorer", "Source Explorer"]) {
      const head = page.getByRole("button", { name, exact: true });
      await expect(head).toBeDisabled();
      await expect(head).toHaveAccessibleDescription(/^nowhere's collections did not load: .*404/);
    }
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

test.describe("the agent", () => {
  test("its page starts a session and takes its address; /new starts another in place", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "dev", "the agent exists only in development");
    await page.goto("/app/agent");
    await expect(page.locator(".agent-status")).toContainText("ready");
    await expect(page).toHaveURL(/\/agent\/[^/]+$/);
    const first = page.url();
    await page.evaluate(() => {
      (window as unknown as { kept: boolean }).kept = true;
    });
    const message = page.getByRole("textbox", { name: "Message" });
    await message.fill("/new");
    // The first Enter picks the command from the list the slash opens; the second sends it.
    await message.press("Enter");
    await expect(message).toHaveValue(/^\/new\s*$/);
    await message.press("Enter");
    await expect(page).not.toHaveURL(first);
    await expect(page).toHaveURL(/\/agent\/[^/]+$/);
    await expect(page.locator(".agent-status")).toContainText("ready");
    expect(await page.evaluate(() => (window as unknown as { kept?: boolean }).kept)).toBe(true);
  });
});

test.describe("the agent's chat in the Trace Console", () => {
  const rail = (page: import("@playwright/test").Page) =>
    page.getByRole("navigation", { name: "Agent sidebar" });
  const chatToggle = (page: import("@playwright/test").Page) =>
    page.getByRole("button", { name: "Show or hide the agent" });

  test("the chat's rail is at the right in a workspace, and absent outside one or in a build", async ({
    page,
  }, info) => {
    await page.goto("/app/workspace/alpha/Q_1");
    await expect(header(page)).toHaveText("Q_1");
    if (info.project.name !== "dev") {
      await expect(rail(page)).toHaveCount(0);
      return;
    }
    await expect(rail(page)).toBeVisible();
    const box = await rail(page).boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBe(page.viewportSize()?.width);
    await page.goto("/app/");
    await expect(page.getByText("Pick a type on the left")).toBeVisible();
    await expect(rail(page)).toHaveCount(0);
  });

  test("expanding the chat connects a session in the workspace's folder and names it in the address; minimising keeps it", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "dev", "the agent exists only in development");
    const opened: string[] = [];
    page.on("request", (req) => {
      const body = req.postData();
      if (req.url().endsWith("/acp") && body?.includes('"session/new"')) opened.push(body);
    });
    await page.goto("/app/workspace/alpha/Q_1");
    const folder = await page.evaluate(async () => {
      const res = await fetch("/agent-workspace/alpha");
      return ((await res.json()) as { cwd: string }).cwd;
    });
    const chat = page.getByRole("complementary", { name: "Agent" });
    await chatToggle(page).click();
    await expect(chat.locator(".agent-status")).toContainText("ready");
    await expect(chat.getByRole("textbox", { name: "Message" })).toBeVisible();
    await expect(page).toHaveURL(/[?&]session=fake-\d+/);
    const named = new URL(page.url()).searchParams.get("session");
    // The session opened in the folder the workspaces mapping file gives alpha.
    expect(opened).toHaveLength(1);
    expect(JSON.parse(opened[0] ?? "{}").params.cwd).toBe(folder);

    await chatToggle(page).click();
    await expect(chat).toBeHidden();
    await chatToggle(page).click();
    await expect(chat.locator(".agent-status")).toContainText("ready");
    expect(new URL(page.url()).searchParams.get("session")).toBe(named);

    // Opening a record keeps the session in the address, and a reload reopens it.
    await page.locator(".card-head", { hasText: "LOE_1" }).click();
    await expect(header(page)).toHaveText("LOE_1");
    expect(new URL(page.url()).searchParams.get("session")).toBe(named);
    await page.reload();
    await expect(chat.locator(".agent-status")).toContainText("ready");
    expect(new URL(page.url()).searchParams.get("session")).toBe(named);
  });

  test("in a workspace the mapping file does not map, the chat's button is disabled and says why; going home drops the session", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "dev", "the agent exists only in development");
    await page.goto("/app/workspace/alpha/Q_1");
    await chatToggle(page).click();
    await expect(page).toHaveURL(/[?&]session=fake-\d+/);
    await page.getByRole("button", { name: "LabKit" }).click();
    await expect(page).toHaveURL(/\/app\/$/);
    await row(page, "beta").click();
    await expect(chatToggle(page)).toBeDisabled();
    await expect(chatToggle(page)).toHaveAttribute("title", /maps no folder to the workspace beta/);
    expect(new URL(page.url()).searchParams.get("session")).toBeNull();
  });

  test("a session the address names that the agent cannot reopen says so, and /new starts another", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "dev", "the agent exists only in development");
    await page.goto("/app/workspace/alpha/Q_1?session=no-such-session");
    const chat = page.getByRole("complementary", { name: "Agent" });
    await chatToggle(page).click();
    await expect(chat.locator(".agent-status")).toContainText("failed");
    await expect(chat).toContainText("Send /new to start a new session.");
    const message = chat.getByRole("textbox", { name: "Message" });
    await expect(message).toBeEnabled();
    await message.fill("/new");
    await message.press("Enter");
    await expect(message).toHaveValue(/^\/new\s*$/);
    await message.press("Enter");
    await expect(chat.locator(".agent-status")).toContainText("ready");
    await expect(page).toHaveURL(/[?&]session=fake-\d+/);
  });

  test("dragging the chat's border widens it, a reload keeps the width, and its keys and double-click move it", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "dev", "the agent exists only in development");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/app/workspace/alpha/Q_1");
    const chat = page.getByRole("complementary", { name: "Agent" });
    await chatToggle(page).click();
    await expect(chat.locator(".agent-status")).toContainText("ready");
    const width = async () => Math.round((await chat.boundingBox())?.width ?? -1);
    await expect.poll(width).toBe(400);
    const border = page.getByRole("separator", { name: "Resize the agent" });
    const at = await border.boundingBox();
    if (at === null) throw new Error("the border has no box");
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x + at.width / 2 - 100, at.y + at.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect.poll(width).toBe(500);

    await page.reload();
    await expect(chat.locator(".agent-status")).toContainText("ready");
    await expect.poll(width).toBe(500);

    await border.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(width).toBe(484);
    await page.keyboard.press("Home");
    await expect.poll(width).toBe(320);
    await page.keyboard.press("End");
    await expect.poll(width).toBe(768);
    await border.dblclick();
    await expect.poll(width).toBe(400);
  });
});
