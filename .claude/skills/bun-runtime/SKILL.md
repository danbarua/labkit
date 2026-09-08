---
name: bun-runtime
description: Use when a LabKit build, script, or test behaves differently from the same code run directly — a compiled binary that cannot find a file, a test timeout that ignores its configured value, a captured command output that is truncated or empty, a shell check that passes over nothing. Covers bun, $bunfs, PGlite, drizzle, biome, and BSD shell traps. Each entry is a measured behaviour, not a design rule.
---

# Bun, PGlite and shell traps in LabKit

Every entry below was found by debugging, not by reading a manual. Each states
what happens, not what should happen.

## `bun build --compile` and `$bunfs`

| behaviour | consequence |
|---|---|
| `import.meta.url` inside a compiled bundle is `/$bunfs/root/…`, not a directory on disk | any code that derives a folder from it finds nothing. Hand assets over with `import … with { type: "file" }` instead of locating them |
| `$bunfs` does not implement streaming | `existsSync` returns true and `open` then fails `ENOENT`. `readFileSync` works. PGlite reads extension tarballs with `createReadStream`, so those must be copied to a temp file first |
| a missing `pglite.data` surfaces as `Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"` | the real cause is two levels down in `error.cause`. Read `error.cause` before believing the message |
| `bun build --compile` writes a byte-identical copy of the `bun` binary as `.<hash>-00000000.bun-build` | it lands in the **current working directory**, not beside `--outfile`, and is never removed. No flag disables it. Build from a temp directory that is deleted on exit |
| `bun build` embeds only files it can resolve statically | `import.meta.resolve` answers at runtime, too late. A non-exported subpath needs a relative import into `node_modules/` |

Upstream: PGlite #414 and Bun #15032 are the same `ENOENT /$bunfs/root/pglite.data`, open since Bun 1.1.33.

## `bun` CLI

| behaviour | consequence |
|---|---|
| a bare `bun test` bypasses `package.json` | it runs at bun's 5000ms default, not the `test` script's `--timeout`. Always route through `bun run test` |
| `bunfig.toml`'s `[test] timeout` is ignored | measured on 1.3.14 and 1.4.0. Use `--timeout` on the script |
| `bun run` does not glob | `bun run check:*` is not a thing. A runner must read `package.json` and iterate |
| `bunx` hands a `#!/usr/bin/env node` binary to ambient node | `tsc`, `depcruise` and `depcruise-fmt` all carry that shebang. Pass `--bun` |
| stdout to a pipe is non-blocking | one `writeSync` moves what fits in the pipe buffer (65,536 bytes measured), returns that count, and reports no error for the rest. A truncated report exits 0 and looks complete. `EAGAIN` means full, not broken |
| `FORCE_COLOR=1` makes colour libraries write escapes into a pipe | `$(labkit criterion …)` then captures escape sequences. A command whose whole output is an id must never colour it |

## PGlite

| behaviour | consequence |
|---|---|
| a `dataDir` missing its final path segment silently initialises a fresh empty cluster | no error. You back up or query the wrong thing with no signal. Always open through the connection helper, which holds the lock and checks the path |
| there is no `pg_dump` | the equivalents are `dumpDataDir()` / `loadDataDir()`. The dump is a tarball that gzips about six times |
| PGlite is single-writer and single-process | the mutex is a PID lockfile opened `wx` — atomic exclusive-create, the same mechanism as `postmaster.pid` |
| a cold open (initdb plus first migration) takes about 1067ms against 80-96ms warm | any lock deadline must clear the cold case |
| `count(*)` and `bigserial` come back as a string from `pg` and a number from raw PGlite | decode both |

## drizzle

| behaviour | consequence |
|---|---|
| the `pg-proxy` driver decodes rows positionally | hand it objects and it does not fail: `select().from(t)` returns `[{}, {}]`, one empty object per row, right count, no error. `.where()` throws `value.map`. Only `method === "all"` wants `rowMode: "array"` |
| `DrizzleQueryError.name` is the inherited `"Error"` | recognise it by its own `query` / `params` properties. Its message prints bound parameter values, so never log it where a caller can read it. `err.cause` carries the driver error with SQLSTATE intact |
| `readMigrationFiles` reads `meta/_journal.json` with `node:fs` from an `import.meta.url` folder | it cannot work in a compiled binary. There is no pglite migrator that takes `{journal, migrations}`, though `durable-sqlite` has one |
| migration identity is a `sha256` of the whole file, split on `--> statement-breakpoint` | diverge from that and two databases silently disagree about what has run |
| `pgSchema("public")` is rejected at runtime | use the default schema |
| drizzle-kit 0.30.6: `pgRole(n).existing()` is what suppresses `CREATE ROLE` | `createRole: false` is the Postgres `CREATEROLE` attribute. `entities.roles.exclude` is read only by the introspection path |

## biome

The config file must be `biome.jsonc`. `biome.json` rejects comments, and
`biome format --write` then falls back to its defaults **silently** — no parse
error, just "Formatted N files". `biome check` does report the parse error; the
writing command does not.

Biome re-indents comments and never reflows them. It does split a call across
lines, which breaks any test that matches source text with a regex. Read the
AST instead.

## Shell — this userland is zsh on BSD

| trap | correct form |
|---|---|
| `\s`, `\d`, `\w`, `\+` are not classes in BSD `sed`/`grep` | they match the literal letter and fail silently. Use `[[:space:]]` |
| `$?` after a pipeline reports the **last** command's status | redirect to a file and read the file |
| bash has `PIPESTATUS`; zsh has lowercase `pipestatus` | the wrong one falls through to `$?` |
| `exit` inside `$(…)` ends only the subshell | the assignment succeeds with an empty string. Write `x="$(f …)" \|\| exit $?` |
| an unquoted glob aborts the whole command in zsh when it matches nothing | quote every glob |
| `grep -c … \|\| echo 0` prints `0` **and** exits 1 | the field doubles |
| `cksum` is POSIX everywhere; `sha256sum` is not | use `cksum` in scripts that must be portable |

## git

| behaviour | consequence |
|---|---|
| `git rev-parse --git-common-dir` returns a relative `.git` at the top of a normal checkout | `--path-format=absolute` fixes it and needs git 2.31+ |
| `--git-common-dir` names the one `.git` a repository has, from any worktree | `--show-toplevel` names the worktree instead, which is a different answer |
| a linked worktree's `.git` is a file containing `gitdir: …/.git/worktrees/<name>` | stripping `/worktrees/<name>` gives the project root with no subprocess |
| `git init --separate-git-dir` yields a `.git` file with no `worktrees/` component | there is no reliable path back to a working tree. Refuse rather than guess |
