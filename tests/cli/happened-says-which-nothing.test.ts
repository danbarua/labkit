/**
 * `happened` renders four different facts that used to arrive as one empty list,
 * and prints what an act was asked to do rather than only what it did.
 */

import { expect, test } from "bun:test";
import { renderHappened } from "../../src/cli/views/events";
import { domainEvent, UNATTRIBUTED } from "../../src/domain";
import type { DomainEvent } from "../../src/domain/events";
import { PLAIN } from "../../src/cli/palette";

const act = (seq: number | undefined, command: Record<string, unknown>): DomainEvent =>
  domainEvent({
    ...(seq === undefined ? {} : { seq }),
    at: "2026-09-16T09:00:00.000Z",
    attribution: UNATTRIBUTED,
    operation: "undo",
    subject: "CEVAL_22",
    command: command as never,
  });

test("a zero-sized page says acts exist rather than nothing matches", () => {
  const rendered = renderHappened({ acts: [], more: true, narrowed: false }, PLAIN);
  expect(rendered).toContain("Acts exist");
  expect(rendered).not.toContain("Nothing recorded");
});

test("an exhausted cursor names the seq it is past", () => {
  const rendered = renderHappened({ acts: [], more: false, since: 264, narrowed: false }, PLAIN);
  expect(rendered).toContain("Nothing after seq 264");
  expect(rendered).toContain("end of the log");
});

test("an exhausted cursor under a filter says the filter is what ran out", () => {
  const rendered = renderHappened({ acts: [], more: false, since: 264, narrowed: true }, PLAIN);
  expect(rendered).toContain("end of what these filters match");
});

test("a filter that matches nothing does not read as an empty log", () => {
  const rendered = renderHappened({ acts: [], more: false, narrowed: true }, PLAIN);
  expect(rendered).toContain("No act matches those filters");
  expect(rendered).toContain("The log is not empty");
});

test("an empty log says so, and only then", () => {
  const rendered = renderHappened({ acts: [], more: false, narrowed: false }, PLAIN);
  expect(rendered).toContain("Nothing recorded");
});

test("an act prints the arguments it was given, not only what it minted", () => {
  const rendered = renderHappened(
    {
      acts: [act(178, { event: 174, because: "bound to the wrong criterion" })],
      more: false,
      narrowed: false,
    },
    PLAIN,
  );
  expect(rendered).toContain("event 174");
  expect(rendered).toContain("bound to the wrong criterion");
});

test("a long argument is cut to a gist, so the log does not become a wall", () => {
  const because = `${"the loss module was broken and ".repeat(20)}end`;
  const rendered = renderHappened(
    { acts: [act(1, { because })], more: false, narrowed: false },
    PLAIN,
  );
  for (const line of rendered.split("\n")) expect(line.length).toBeLessThan(140);
  expect(rendered).not.toContain("end");
});

test("an unsequenced act prints no sequence rather than sequence zero", () => {
  const rendered = renderHappened(
    { acts: [act(undefined, {})], more: false, narrowed: false },
    PLAIN,
  );
  expect(rendered.split("\n")[0]).toContain("?");
  expect(rendered.split("\n")[0]).not.toMatch(/^\s*0\s/);
});

test("a truncated page of unsequenced acts offers no cursor it cannot honour", () => {
  const rendered = renderHappened(
    { acts: [act(undefined, {})], more: true, narrowed: false },
    PLAIN,
  );
  expect(rendered).not.toContain("--since");
  expect(rendered).toContain("`--limit` takes a bigger one");
});
