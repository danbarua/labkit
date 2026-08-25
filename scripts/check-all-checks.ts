#!/usr/bin/env bun
/**
 * Every check script must introduce itself in one plain sentence.
 *
 * The audience is someone who changed code, ran `bun run check`, and is now
 * looking at a failure from a script they have never opened. `check:prop-classes`
 * tells them nothing. *"Holds `INDEXED_PROPS` to the string taxonomy it is
 * supposed to mirror"* tells them where to look, and that sentence has to be
 * somewhere findable for `bun run check` to print it.
 *
 * So this file is a linter with a second job: {@link summaryOf} is what
 * `check-all.ts` calls to get the line it prints before running each step. The
 * rules below exist so that function always has something to find.
 *
 * **Yes, it is a check that checks the checks.** It earns the joke the way any
 * check here has to: it found two real defects the moment it was written —
 * `check-migrations.ts`, which predates the convention entirely, and
 * `smoke-cli.sh`, which was written this same week with a stray `#` that pushed
 * its sentence down a line.
 *
 * And it is its own good example, by construction: it is a `.ts` check script,
 * so it lints itself. `scripts/check-no-tracked-symlinks.sh` is the `.sh` one —
 * a real script that was already right, rather than a wrapper invented to be an
 * example. A file whose only consumer is a error message is the shape this repo
 * deletes.
 *
 * Usage: bun run check:all-checks
 * Exit:  0 when every wired-up script has a findable summary, 1 otherwise.
 */

import { readFileSync } from "node:fs";

/** What a well-formed header looks like, per language, for the error message. */
const SHAPE = {
  ts: [
    "#!/usr/bin/env bun",
    "/**",
    " * One sentence: what this checks. Plain English, no jargon.",
    " *",
    " * Then the prose — why it exists, what it caught, what it does not prove.",
    " */",
  ],
  sh: [
    "#!/usr/bin/env bash",
    "# One sentence: what this checks. Plain English, no jargon.",
    "#",
    "# Then the prose — why it exists, what it caught, what it does not prove.",
  ],
} as const;

const EXEMPLAR = {
  ts: "scripts/check-doc-comments.ts",
  sh: "scripts/check-no-tracked-symlinks.sh",
} as const;

/** One thing wrong with a header, as a line number and what was expected. */
interface Problem {
  line: number;
  expected: string;
  found: string;
}

/**
 * Reads a check script's header and returns what is wrong with it.
 *
 * Empty means the header is well-formed and {@link summaryOf} will find its
 * sentence — the two functions read the same lines, which is why one cannot
 * pass while the other returns nothing.
 */
export function problemsWith(path: string): Problem[] {
  const lines = readFileSync(path, "utf8").split("\n");
  const at = (n: number) => lines[n - 1] ?? "<end of file>";
  const problems: Problem[] = [];
  const want = (line: number, ok: boolean, expected: string) => {
    if (!ok) problems.push({ line, expected, found: at(line) });
  };

  if (path.endsWith(".sh")) {
    want(1, at(1).startsWith("#!"), "a shebang");
    // The sentence is on line 2 for shell, because there is no block opener to
    // spend a line on. This is exactly why `check-all.ts` asks this file for
    // the summary instead of printing a fixed line number.
    want(2, /^# \S/.test(at(2)), "`# ` and one sentence saying what this checks");
    want(3, at(3).trim() === "#", "`#` alone — a blank comment line");
    want(4, /^# \S/.test(at(4)), "`# ` and the prose: why this exists");
    return problems;
  }

  want(1, at(1).startsWith("#!"), "a shebang");
  want(2, at(2).trim() === "/**", "`/**` — the doc comment opener");
  want(3, /^ \* \S/.test(at(3)), "` * ` and one sentence saying what this checks");
  want(4, at(4).trim() === "*", "` *` alone — a blank comment line");
  want(5, /^ \* \S/.test(at(5)), "` * ` and the prose: why this exists");
  return problems;
}

/**
 * The one-sentence summary a check script opens with, or `null`.
 *
 * **The line differs by language** — 3 for TypeScript, 2 for shell — which is
 * the whole reason this is a function rather than a number written down twice.
 * `null` means the header is malformed, which `check:all-checks` is what stops
 * from happening.
 */
export function summaryOf(path: string): string | null {
  const lines = readFileSync(path, "utf8").split("\n");
  const raw = path.endsWith(".sh") ? lines[1] : lines[2];
  const stripped = raw?.replace(/^\s*(?:\*|#)\s?/, "").trim();
  return stripped ? stripped : null;
}

/** Every script file a `check`, `check:*` or `probe:*` package script runs. */
export function checkScriptPaths(): string[] {
  const { scripts }: { scripts: Record<string, string> } = JSON.parse(
    readFileSync("package.json", "utf8"),
  );
  return [
    ...new Set(
      Object.entries(scripts)
        // `check`, `check:*` and `probe:*` -- the rule is about scripts wired
        // into `package.json` for a person to run, not about one prefix. The
        // probe is the reason: nobody running it should have to read forty
        // lines to learn what it asks.
        .filter(([name]) => name.startsWith("check") || name.startsWith("probe:"))
        .map(([, command]) => command.split(/\s+/).find((token) => token.startsWith("scripts/")))
        .filter((path): path is string => path !== undefined),
    ),
  ].sort();
}

if (import.meta.main) {
  const failures = checkScriptPaths()
    .map((path) => ({ path, problems: problemsWith(path) }))
    .filter(({ problems }) => problems.length > 0);

  if (failures.length > 0) {
    console.error("FAILED: a script does not introduce itself.\n");
    for (const { path, problems } of failures) {
      const kind = path.endsWith(".sh") ? "sh" : "ts";
      console.error(`  ${path}`);
      for (const { line, expected, found } of problems) {
        console.error(`    line ${line}: expected ${expected}`);
        console.error(`             got: ${found || "<empty line>"}`);
      }
      console.error(`\n  What a ${kind} check script opens with:\n`);
      for (const line of SHAPE[kind]) console.error(`    ${line}`);
      console.error(`\n  A real one: ${EXEMPLAR[kind]}\n`);
    }
    console.error(
      "`bun run check` prints that sentence before running each step, so a\n" +
        "reader who has never opened the script knows what failed and why.",
    );
    process.exit(1);
  }

  const paths = checkScriptPaths();
  console.log(`OK: all ${paths.length} scripts introduce themselves in one line.`);
}
