# The map exists looking backward

LabKit is a domain for exploration. It does not hold a plan of the territory. It holds **acts**, in order. The map is what you see when you read those acts backward through time.

This package is a window on one such recording: the first dogfood of using LabKit to track a real research spike (`overlap-bench`, tenant 1, pg0 `labkit` on 5433).

## Two stores, one stream

`labkit_event` is the WAL. Each row is one act: `seq`, `at`, `operation`, `subject`, `changes[]` (`NodeCreated`, `EdgeCreated`, `PropsChanged`), who did it.

The AGE graph is a **projection** of that stream. `applyDelta` in `src/domain/projection.ts` is the projector. Handles (`Q_1`, `LOE_7`, `NOTE_68`) are points on the drawing, not a schema you fill in advance.

A copy that takes vertices and edges and leaves `labkit_event` empty is a screenshot without the film. Time queries have nothing to stand on. The ingest here now copies the event log. Replaying it through `applyDelta` to rebuild the graph is the honest next ingest. `createEdge` will refuse some stored pairs. That is a fact about today's verbs, not a reason to skip the WAL.

## Grain

This first session is **214 acts**, seq 1–215, `2026-09-08T19:40Z` (`Q_1` posed) through `2026-09-11T17:23Z`. Median step between seqs is 16 seconds. Most gaps are under a minute. The work sits in **hour piles**: Sep 8 21h (47 acts), Sep 9 03–07h (the thick stretch), Sep 11 03h (24). Then idle.

That is an agent session tracking a spike, not a month of "research activity." A human-facing timeline of *observations* (Hindsight: same-minute stamps, month buckets, 434 undated) is a coarser grain. Do not mix them. LabKit's `at` is the act clock.

## What you walk

The explorer starts at the first pose and follows links that exist.

`Q_1` → `LOE_7` → `NOTE_68`

A relation is a hypermedia link, or it is absent. Retracted nodes are not linked. You are not browsing a CMS. You are walking the drawing the WAL already made.

Colour overlays (kind / standing / temporal) and 2D/3D chrome are how a human without a million-token window sees structure.

This package will grow Hindsight-shaped components on **this** graph: constellation (group by scope), table, timeline. The stream is `labkit_event` and the AGE projection, not a memory bank. Link types are edge labels (MOTIVATES, CONCERNS, SUPPORTS, GATES). Timeline is `at` / `seq`.

## Looking backward

Nothing in the domain requires the explorer to know the destination when the pose is recorded. The last note is last because it is last in `seq`, not because a design doc named it.

The map is the trail. It is only there after you walk.
