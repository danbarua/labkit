# The LabKit Explorer

A step-by-step, force-directed (2D and 3D) renderer of a research record as
LabKit actually built it. Not a mockup, not a fixture — every trace it shows
is derived fresh from the real domain (or a real port of it) each time the
server boots.

## Where the code lives

| Path | What it is |
| --- | --- |
| `explorer/` (this directory) | The frontend: `index.html`, `style.css`, `app.js`. Vanilla JS, no build step, no dependency — reads `GET /api/traces` and renders. |
| `scripts/serve-explorer.ts` | The server. Builds every `fragments/compositions.ts` arc through the real TS domain at boot, optionally reads Rust/Grafeo NDJSON traces (`--rust-traces <dir>`), and serves both plus the static frontend. `bun run explorer`. |
| `fragments/` | The composable research moves and arcs a trace is built from — see below, this is the part worth reading first. |
| `scripts/read-rust-traces.ts` | Parses `LABKIT_TRACE_OUT` NDJSON from the Rust/Grafeo port (`spikes/labkit-rust/`) into the same trace shape. |
| `scripts/demo-rust-explorer.sh` | `bun run demo:rust-explorer` — builds the Rust port, generates one trace, serves it. The commands that connect the two pieces above, runnable rather than reconstructed from reading both files. |
| `scripts/check-compositions.ts` | The check (`bun run check:compositions`) that every arc still runs and connects only what it creates. |

Nothing here is a spike. It ships, `bun run check` covers it, and
`spikes/README.md`'s rule — *a spike that gets adopted is deleted, not
promoted* — is why this is not filed under `spikes/`.

## What it does

Given a sequence of research-verb calls (`pose`, `pursue`, `recordAnalysis`,
`closeEnquiry`, …), it:

1. Runs them against a real, hermetic LabKit database and reads back every
   node and edge each act actually created — nothing hand-drawn, nothing
   guessed. The original mockup this replaced hand-wrote its graph data and
   was wrong about it: it named eight edges where `recordAnalysis` writes
   eight, but the eight were typed by a person, not read off a run.
2. Plays that sequence back one step at a time — Next, Play, a speed slider —
   with the graph growing and rearranging as it goes, nodes fading when an act
   concludes them.
3. Shows, per step, three things side by side: the **act** (what command ran),
   the **record delta** (which nodes and edges that act actually created), and
   the **derived changes** (what LabKit's own read-side reports now say about
   the affected enquiries and gates — which is a different question, and the
   two can and do disagree in count: a step can write eight edges and move no
   enquiry's closure at all).
4. Offers three colour readings of the same graph — structural (node kind),
   standing (an enquiry's closure / a gate's state), temporal (created this
   step / touched this step / historical) — because cramming all three into
   one palette stops being readable once a trace gets long.
5. Renders a second, independently-built model of the same domain (the
   Rust/Grafeo port, `spikes/labkit-rust/`) in the same viewer, tagged by
   origin so a viewer never mistakes one model's trace for the other's.
   Building this side-by-side view is what surfaced six places the two models
   actually disagree on edge shape (#123) — a discussion, not a verdict, per
   Dan's correction: neither implementation is automatically the reference.

## What it does not do

- **It is not an authoring tool.** It cannot record a new arc by clicking
  around the graph. An arc is written in `fragments/compositions.ts`, in code,
  by composing moves from `fragments/index.ts` — see
  `.claude/skills/compose-scenario/SKILL.md`.
- **It does not check anything about the domain model.** It shows what a run
  produced. Whether that's the *right* graph is a question for
  `tests/scenarios/` (PJ-008's acceptance corpus) and the exo-ledger, not for
  this viewer. A wrong edge renders exactly as confidently as a right one.
- **It is not a fixture.** There is no committed trace JSON. Every trace is
  rebuilt from the domain on every server start, so the picture cannot drift
  out of sync with the code the way a checked-in mockup did.
- **It does not reconstruct the CLI.** The command line shown per step
  (`labkit pose --question "..."`) is assembled for display from the event's
  `operation` and `detail` fields and is explicitly not a claim that string
  would run — see `fragments/trace.ts`'s `commandOf()`. Anything that needs to
  assert a real CLI invocation drives the CLI, as `scripts/smoke-cli.sh` does.
- **Play doesn't survive a backgrounded tab.** It drives playback off
  `requestAnimationFrame`, which browsers suspend when a tab isn't visible —
  switch away mid-animation and it pauses silently rather than catching up.
  Known, not yet worth a `setInterval` fallback.

## Why `fragments/` is the interesting part

The Explorer is a viewer. `fragments/` is what it's a viewer *of*, and it's
also the part with a use beyond rendering.

Sixteen composable moves (`askAndPursue`, `gatedWork`, `observeAndAnalyse`,
`failedCheck`, `replaceAnalysis`, `reinterpretClaim`, `reverifyEarlier`, …:
`grep -n "^export async function" fragments/index.ts` for the current list —
not repeated here, for the reason CLAUDE.md gives for never repeating a
derivable count) compose into arcs in `fragments/compositions.ts`. The longest
one currently checked in — `"An eighteen-month programme"`, `aProgramme` — is
29 steps: a question sharpened once mid-arc into a narrower one alongside a
freshly-opened subgroup question, an analysis found wrong and replaced (not by
new data — a review of the same run), a reinterpreted claim, a negative result
accepted as unresolved rather than pursued further, a promotion, a closure,
and a reverification a year later on fresh inputs. It's still one composition,
short of what a real multi-year research programme looks like, and doesn't
yet touch every move — `amendLockedDesign`, for instance, only appears in a
shorter, single-mechanic composition (`"Amending a locked design"`).

That gap is the thing worth building on. LabKit's acceptance corpus
(`tests/scenarios/`) is 32 files earning individual mechanics one at a time,
each deliberately independent and each opening on an empty graph — right for
proving a mechanic in isolation, and not shaped to show what happens when a
dozen mechanics interact over a long research arc the way a real programme
does. `fragments/` is the one place in this repo where that longer arc can be
written *and actually run against the real domain* without becoming a second,
untested implementation of it — every move is the same `WriteSurface` call a
real CLI or MCP client would make.

So the useful next step probably isn't more Explorer UI. It's more — and
longer, and stranger — compositions: research histories that run for a
simulated year or more, chain amendments on top of amendments, leave a
sharpened question standing unpursued the way `aProgramme` does, replace an
analysis whose replacement is itself later reviewed. Two things to watch for
when writing one, both already true of the domain and both catchable only by
trying:

- **The domain will refuse a move that doesn't make sense**, and the refusal
  is usually the useful part — a composition that doesn't type-check is
  boring, but one that types perfectly and gets refused at runtime is telling
  you the arc doesn't match how LabKit thinks research actually proceeds. See
  `.claude/skills/compose-scenario/SKILL.md` §3 for a worked example.
- **A model reading confusing to a careful reader is worth checking against
  the schema before assuming the reader is wrong.** Comparing the Rust port's
  own trace output against `src/db/domain.ts`'s `EDGE_SCHEMA` (#123) turned up
  six edges the port had reasoned about rather than checked — a reversed
  `GOVERNS`, a `MOTIVATES` pair that isn't in the schema, three edges with no
  TS equivalent at all. All six turned out to be mistakes in the port, not
  gaps in the TS model, once someone actually ran the comparison instead of
  reasoning from what seemed plausible. The lesson generalises past that one
  port: an independently-built second model is a way of finding out whether a
  schema comment says what a reader would actually infer from it, and the way
  to find out is to build something against the schema and check, not to trust
  a plausible-sounding read of it — which is exactly what a long composition
  forces, one move at a time.
