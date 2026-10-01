/**
 * The read commands — one per public verb on `ReadSurface`.
 */

import type { Command } from "commander";
import { parseCommand, whole } from "../args";
import { answer } from "../output";
import type { Run } from "../session";
import {
  claimsAssertingQuery,
  collectionQuery,
  DEFAULT_PAGE,
  MAX_PAGE,
  eventFilter,
  gateListQuery,
  notesQuery,
  nowQuery,
  resourceQuery,
  searchQuery,
  whyQuery,
  workListQuery,
} from "@labkit/core-domain/queries";
import { GATE_STATES, WORK_STATES } from "@labkit/core-domain/vocab";
import { renderWhyDispatch, renderClaims, renderSearch } from "../views/knowledge";
import { renderGateList, renderWorkList } from "../views/gates";
import {
  renderAnalysisList,
  renderClaimList,
  renderCriterionList,
  renderEnquiryList,
} from "../views/inventory";
import { renderHappened, renderNotes } from "../views/events";
import { renderStanding } from "../views/standing";

export function registerReads(program: Command, run: Run): void {
  program
    .command("now")
    .helpGroup("What stands")
    .summary("show me what the programme says matters")
    .description(
      "Blocked gates and the work each protects, gates nobody has finished checking, planned " +
        "work nothing has touched, and where every question stands. `--since <seq>` narrows " +
        "every section to what moved since that seq. Always prints the current `seq`.",
    )
    .option("--since <seq>", "only what moved since this seq -- the one `now` last returned", whole)
    .action(async ({ since }: { since?: number }) => {
      const query = parseCommand(nowQuery, { ...(since === undefined ? {} : { since }) });
      return run(async ({ read }) => answer(await read.now(query), renderStanding));
    });
  program
    .command("why")
    .helpGroup("What stands")
    .summary("why a record is in the state it's in")
    .description(
      "What one record is and what makes it so. A claim: the findings under it and against it, " +
        "the standard it is held to, its verdict. Planned work: its state and what decides it, " +
        "and the line of enquiry and question it exists to advance. A line of enquiry: its status, " +
        "and where its question stands. A gate: blocked, incomplete, satisfied or never " +
        "evaluated, and the checks behind it. A condition: its evaluations. An analysis: what " +
        "it revised, or what it read and produced. Any other handle (a question, note, " +
        "finding, evidence unit, observations, decision, evaluation, review): its own words " +
        "and every record " +
        "joined to it. A proposition resolves only when exactly one claim asserts that " +
        "sentence; none or several is refused, naming the claims. `labkit get <handle>` shows " +
        "what is stored under a handle instead.",
    )
    .argument("<subject>", "a handle of any kind, or a claim's proposition")
    .action(async (subject: string) => {
      const query = parseCommand(whyQuery, { subject });
      return run(async ({ read }) => answer(await read.why(query), renderWhyDispatch));
    });
  program
    .command("search")
    .helpGroup("Finding a handle")
    .summary("every record containing this text — a second seam where wording is resolved")
    .description(
      "Substring, case-insensitive, across every text property. Groups matches by kind. " +
        "`claims <sentence>` is the narrower search, by a claim's exact wording.",
    )
    .argument("<text>", "the text to search for")
    .action(async (text: string) => {
      const query = parseCommand(searchQuery, { text });
      return run(async ({ read }) => {
        const groups = await read.search(query);
        return answer(groups, (g, p) => renderSearch(g, query.text, p));
      });
    });
  program
    .command("claims")
    .helpGroup("Finding a handle")
    .summary("every claim, or the ones asserting a sentence")
    .description(
      "With no argument, every claim on the record and whether anything bears against it. " +
        "With one, the claims asserting that sentence — every match rather than one, because " +
        "two lines of enquiry can assert the same sentence about different endpoints.",
    )
    .argument("[proposition]", "the sentence, as worded")
    .action(async (proposition?: string) => {
      if (proposition === undefined)
        return run(async ({ read }) => answer(await read.claimList(), renderClaimList));
      const query = parseCommand(claimsAssertingQuery, { proposition });
      return run(async ({ read }) => {
        const claims = await read.claimsAsserting(query);
        return answer(claims, (c, p) => renderClaims(c, query.proposition, p));
      });
    });
  program
    .command("enquiries")
    .helpGroup("Finding a handle")
    .summary("every line of enquiry")
    .description("What is being pursued, and how much of it has actually been run.")
    .action(async () =>
      run(async ({ read }) => answer(await read.enquiryList(), renderEnquiryList)),
    );
  program
    .command("analyses")
    .helpGroup("Finding a handle")
    .summary("every analysis")
    .description("What was run, and how many findings came out of it.")
    .action(async () =>
      run(async ({ read }) => answer(await read.analysisList(), renderAnalysisList)),
    );
  program
    .command("conditions")
    .helpGroup("What is blocked")
    .summary("every condition on the record")
    .description("What results are held to, and how each condition currently stands.")
    .action(async () =>
      run(async ({ read }) => answer(await read.criterionList(), renderCriterionList)),
    );
  program
    .command("gates")
    .helpGroup("What is blocked")
    .summary("every gate and whether it is satisfied")
    .description(
      "Where to start with a record you do not know: every gate, with a handle for each. " +
        "`--state blocked` is what is stopping work.",
    )
    .option("--state <state>", GATE_STATES.join(" | "))
    .action(async (opts: { state?: string }) => {
      const query = parseCommand(gateListQuery, {
        ...(opts.state === undefined ? {} : { state: opts.state }),
      });
      return run(async ({ read }) =>
        answer(await read.gateList(query), (gates, p) => renderGateList(gates, p, true)),
      );
    });
  program
    .command("work")
    .helpGroup("What is blocked")
    .summary("every planned piece of work and whether anything has been done")
    .description(
      "`--state planned` is what is ready to start: on the books, nothing done, nothing in " +
        "its way. `waiting` is planned work behind a gate nobody has finished checking — not " +
        "ready, not blocked; `blocked` is behind a gate with a failed condition. Not the same " +
        "question as `gates` — a gate reaches only the work it protects, and work planned " +
        "without one appears nowhere else. `why <task-id>` gives the line of enquiry (and " +
        "question) a task exists to advance, where `plan` was told one.",
    )
    .option("--state <state>", WORK_STATES.join(" | "))
    .action(async (opts: { state?: string }) => {
      const query = parseCommand(workListQuery, {
        ...(opts.state === undefined ? {} : { state: opts.state }),
      });
      return run(async ({ read }) =>
        answer(await read.workList(query), (work, p) => renderWorkList(work, p, true)),
      );
    });
  program
    .command("notes")
    .helpGroup("What was done")
    .summary("every note on the record, newest first")
    .description(
      "Notes are the one write with no prerequisites, and `search` reaches them only by words " +
        "somebody already remembers. This lists them all — what each says, what it concerns, " +
        "and the question it prompted where it prompted one. `--on <handle>` narrows to the " +
        "notes about one record, which is the only route to them for a claim, gate or line of " +
        "enquiry: `why` surfaces attached notes for a question and not for those.",
    )
    .option("--on <handle>", "only the notes concerning this record")
    .action(async ({ on }: { on?: string }) => {
      const query = parseCommand(notesQuery, { ...(on === undefined ? {} : { concerning: on }) });
      return run(async ({ read }) => answer(await read.notes(query), renderNotes));
    });
  program
    .command("happened")
    .helpGroup("What was done")
    .summary("the acts themselves, oldest first, with who ran them")
    .description(
      "What was done, when, by which agent against which commit. `seq` is both the order " +
        "and the cursor for `--since`.",
    )
    .argument("[id]", "acts about, or minting, this handle")
    .option("--since <seq>", "only acts after this seq — the cursor", whole)
    .option("--by <id>", "one agent's acts, by attribution id")
    .option("--operation <verb>", "one verb, e.g. recordAnalysis")
    .option("--reconstructed", "only acts that say what they were read off")
    // Not `--no-reconstructed`: a negatable flag defaults to on, and the
    // default here is neither arm. "Unsourced" and not "performed" -- nobody
    // said, which is not the same as somebody watched.
    .option("--unsourced", "only acts that say nothing about where they came from")
    .option("--limit <n>", "how many at most", whole, 50)
    .action(
      async (
        id: string | undefined,
        opts: {
          since?: number;
          by?: string;
          operation?: string;
          reconstructed?: boolean;
          unsourced?: boolean;
          limit: number;
        },
      ) => {
        if (opts.reconstructed && opts.unsourced)
          throw new Error(
            "--reconstructed and --unsourced ask for opposite halves; pass neither for both",
          );
        const query = parseCommand(eventFilter, {
          ...(id === undefined ? {} : { touching: id }),
          ...(opts.since === undefined ? {} : { since: opts.since }),
          ...(opts.by === undefined ? {} : { by: opts.by }),
          ...(opts.operation === undefined ? {} : { operation: opts.operation }),
          ...(opts.reconstructed ? { reconstructed: true } : {}),
          ...(opts.unsourced ? { reconstructed: false } : {}),
          limit: opts.limit,
        });
        return run(async ({ read }) => answer(await read.whatHappenedPage(query), renderHappened));
      },
    );
  program
    .command("get")
    .helpGroup("The record as stored")
    .summary("one node as stored, and the neighbours it is wired to")
    .description(
      "The node's properties and the neighbours within --depth hops, each with the edge that " +
        "reaches it, with no interpretation. `why` answers a question about a record; this " +
        "shows what the answer was drawn from. The same resource the HTTP API serves, with " +
        "relative links.",
    )
    .argument("<handle>", "a handle of any kind, e.g. CLM_20")
    .action(async (handle: string) => {
      const query = parseCommand(resourceQuery, { handle, ...depthOption(program) });
      return run(async ({ read }) => {
        const resource = await read.resource(query);
        if (resource === null) throw new Error(`${handle} not found`);
        return answer(resource, () => renderResource(resource));
      });
    });
  program
    .command("list")
    .helpGroup("The record as stored")
    .summary("every node of one type as stored, a page at a time")
    .description(
      "Each node as `get` shows it, oldest handle first, with no interpretation. " +
        "`--offset` and `--limit` page through them; the output says where the next page " +
        `starts. --limit is at most ${MAX_PAGE} and defaults to ${DEFAULT_PAGE}.`,
    )
    .argument("<node_type>", collectionQuery.shape.type.options.join(" | "))
    .option("--offset <n>", "how many nodes to skip", whole)
    .option("--limit <n>", "how many nodes at most", whole)
    .action(async (type: string, opts: { offset?: number; limit?: number }) => {
      const query = parseCommand(collectionQuery, {
        type,
        ...(opts.offset === undefined ? {} : { offset: opts.offset }),
        ...(opts.limit === undefined ? {} : { limit: opts.limit }),
        ...depthOption(program),
      });
      return run(async ({ read }) => {
        const collection = await read.collection(query);
        return answer(collection, () => renderCollection(collection, query.type));
      });
    });
}

/** The global `--depth`, when it was given. */
function depthOption(program: Command): { depth?: number } {
  const depth: number | undefined = program.opts().depth;
  return depth === undefined ? {} : { depth };
}

/** One page of stored nodes: each as `get` renders it, then where the next page starts. */
function renderCollection(collection: unknown, type: string): string {
  const page = collection as {
    offset: number;
    limit: number;
    count: number;
    _links: { next?: unknown };
    _embedded: Record<string, unknown[]>;
  };
  const items = page._embedded[type] ?? [];
  const last = page.offset + page.count;
  const heading =
    page.count === 0
      ? `No ${type} nodes from offset ${page.offset}.`
      : `${type} ${page.offset + 1}-${last}`;
  const next = page._links.next === undefined ? "" : `\n\nMore: --offset ${last}`;
  return [heading, ...items.map(renderResource)].join("\n\n") + next;
}

/**
 * A stored record, as lines rather than JSON.
 *
 * Not `JSON.stringify`: every report goes out through the runner's `wrap()`, which folds
 * long lines and would break the quoting. `--json` is the machine-readable form.
 */
function renderResource(resource: unknown): string {
  const node = resource as StoredNode;
  const skip = new Set(["id", "type", "_links", "_embedded", "dir", "depth"]);
  const lines = [`${node.id ?? "?"}  ${node.type ?? "?"}`, ""];
  for (const [key, value] of Object.entries(node)) {
    if (skip.has(key) || value === null || typeof value === "object") continue;
    lines.push(`  ${key.padEnd(14)} ${String(value)}`);
  }
  const neighbours = renderNeighbours(node, 1);
  if (neighbours.length > 0) lines.push("", ...neighbours);
  return lines.join("\n");
}

interface StoredNode {
  id?: string;
  type?: string;
  _embedded?: Record<string, StoredNode[]>;
  [key: string]: unknown;
}

/** One line per neighbour, each edge's farther hops indented beneath the neighbour they reach from. */
function renderNeighbours(node: StoredNode, hop: number): string[] {
  const indent = "  ".repeat(hop);
  return Object.entries(node._embedded ?? {}).flatMap(([edge, neighbours]) =>
    neighbours.flatMap((n) => [
      `${indent}${edge.padEnd(24)} ${n.id ?? "?"}`,
      ...renderNeighbours(n, hop + 1),
    ]),
  );
}
