# The LabKit Explorer

A step-by-step, force-directed (2D and 3D) renderer of the Bonsai research
record as LabKit actually built it. Not a mockup, not a fixture — every trace
it shows is read straight off a real, durable record, re-read on every
request.

## Where the code lives

| Path | What it is |
| --- | --- |
| `explorer/` (this directory) | The frontend: `index.html`, `style.css`, `app.js`. Vanilla JS, no build step, no dependency — reads `GET /api/traces` and renders. |
| `scripts/serve-explorer.ts` | The server. Reads `.labkit-bonsai/` (or `--db <dir>`) on every request and serves it plus the static frontend. `bun run explorer`. |
| `scripts/read-db-trace.ts` | Opens a real `.labkit/` record (built by the CLI or the MCP server, over real time), reads its full event history, and returns one `Trace`. Acquires and releases the connection per call, same as the MCP server does per tool call, so a long-lived Explorer process never sits on the lock a real writer needs. |
| `fragments/trace.ts` | Turns an event stream into the `Trace`/`TraceStep` shape the frontend renders. |
| `fragments/derive.ts` | Snapshots what LabKit's own read-side says about each enquiry and gate, per step, live during a run. |
| `fragments/replay.ts` | Replays a real record's event history into a disposable scratch database so `derive.ts`'s snapshots can be taken after the fact — see its header for why. |

## What it does

Given the Bonsai record's event history, it:

1. Reads back every node and edge each act actually created — nothing
   hand-drawn, nothing guessed. The original mockup this replaced hand-wrote
   its graph data and was wrong about it: it named eight edges where
   `recordAnalysis` writes eight, but the eight were typed by a person, not
   read off a run.
2. Plays that sequence back one step at a time — Next, Play, a speed slider,
   a draggable scrubber — with the graph growing and rearranging as it goes,
   nodes fading when an act concludes them.
3. Shows, per step, three things side by side: the **act** (what command
   ran), the **record delta** (which nodes and edges that act actually
   created), and the **derived changes** (what LabKit's own read-side reports
   now say about the affected enquiries and gates — which is a different
   question, and the two can and do disagree in count: a step can write eight
   edges and move no enquiry's closure at all).
4. Offers three colour readings of the same graph — structural (node kind),
   standing (an enquiry's closure / a gate's state), temporal (created this
   step / touched this step / historical) — because cramming all three into
   one palette stops being readable once a trace gets long.
5. In the 3D view, places each node along the z-axis by its real recorded
   timestamp rather than playback order, so a batch of events backfilled with
   `--date` (weeks of history imported after the fact) renders at the
   historical moment its timestamps actually name, not bolted onto the newest
   end of the tree.

## What it does not do

- **It is not an authoring tool.** It cannot record a new act by clicking
  around the graph. Growing the record is the CLI's or the MCP server's job.
- **It does not check anything about the domain model.** It shows what the
  record holds. Whether that's the *right* graph is a question for
  `tests/scenarios/` and the exo-ledger, not for this viewer. A wrong edge
  renders exactly as confidently as a right one.
- **It is not a fixture.** There is no committed trace JSON; the record is
  re-read on every request, so the picture cannot drift out of sync with what
  actually happened, the way a checked-in mockup did.
- **The record is read, never written.** The Explorer opens it, reads the
  event history and every created node's properties, and closes the
  connection within one request — the same acquire-and-release shape the MCP
  server uses per tool call. `derived` comes afterward, from
  `fragments/replay.ts` replaying that history — verb by verb, checked
  against itself — into a disposable scratch database, because there is no
  way to ask a durable log what a query would have answered at a past step
  after the fact; the live connection to the real record is long closed by
  the time this runs. Measured against the real, rebuilt Bonsai record: about
  4.1s per request at 133 events (2026-09-01), of which the scratch
  database's own boot and provisioning is roughly 1.1-1.2s — the remainder is
  the replayed verb calls and their `withProvenance` snapshots, and it scales
  with the record: about 10.2s at 335 events (2026-09-01), close to linear in
  the count. Worth knowing before pointing this at a much larger one.
- **It does not reconstruct the CLI.** The command line shown per step
  (`labkit pose --question "..."`) is assembled for display from the event's
  `operation` and `detail` fields and is explicitly not a claim that string
  would run — see `fragments/trace.ts`'s `commandOf()`. Anything that needs
  to assert a real CLI invocation drives the CLI, as `scripts/smoke-cli.sh`
  does.
- **Play doesn't survive a backgrounded tab.** It drives playback off
  `requestAnimationFrame`, which browsers suspend when a tab isn't visible —
  switch away mid-animation and it pauses silently rather than catching up.
  Known, not yet worth a `setInterval` fallback.
