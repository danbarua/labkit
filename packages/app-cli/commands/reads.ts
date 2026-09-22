/**
 * The read commands — one per public verb on `ReadSurface`.
 */

import type { Command } from "commander";
import { parseCommand, whole } from "../args";
import { answer } from "../output";
import type { Run } from "../session";
import {
  claimsAssertingQuery,
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
      "Dispatches on the handle's own kind: a claim (the findings resting under it, what " +
        "bears against it, what standard it was held to, what has superseded it), a task " +
        "(the line of enquiry and question it exists to advance), or a line of enquiry (its " +
        "status, and how well its own question's answer is currently held up). Takes " +
        "a proposition too, when exactly one claim asserts it. Anything else this record does " +
        "not explain yet is refused, naming what it does.",
    )
    .argument("<subject>", "a handle of any kind, or a claim's proposition")
    .action(async (subject: string) => {
      const query = parseCommand(whyQuery, { subject });
      return run(async ({ read }) => answer(await read.why(query), renderWhyDispatch));
    });
  program
    .command("get")
    .helpGroup("Finding a handle")
    .summary("what is stored under a handle, and what it is wired to")
    .description(
      "The record as stored, rather than an answer drawn from it: one node's properties and " +
        "the neighbours within --depth hops, each with the edge that reaches it. Reach for " +
        "this when a read says something the record does not seem to support. The same " +
        "resource the HTTP API serves, with relative links.",
    )
    .argument("<handle>", "a handle of any kind, e.g. CLM_20")
    .action(async (handle: string) => {
      return run(async ({ read }) => {
        const query = parseCommand(resourceQuery, {
          handle,
          ...(program.opts().depth === undefined ? {} : { depth: program.opts().depth }),
        });
        const resource = await read.resource(query);
        if (resource === null) throw new Error(`${handle} not found`);
        return answer(resource, () => renderResource(resource));
      });
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
}

/**
 * A stored record, as lines rather than JSON.
 *
 * Not `JSON.stringify`: every report goes out through the runner's `wrap()`, which folds
 * long lines and would break the quoting. `--json` is the machine-readable form.
 */
function renderResource(resource: unknown): string {
  const node = resource as {
    id?: string;
    type?: string;
    _embedded?: Record<string, Array<{ id?: string; type?: string }>>;
    [key: string]: unknown;
  };
  const skip = new Set(["id", "type", "_links", "_embedded", "dir", "depth"]);
  const lines = [`${node.id ?? "?"}  ${node.type ?? "?"}`, ""];
  for (const [key, value] of Object.entries(node)) {
    if (skip.has(key) || value === null || typeof value === "object") continue;
    lines.push(`  ${key.padEnd(14)} ${String(value)}`);
  }
  const embedded = Object.entries(node._embedded ?? {});
  if (embedded.length > 0) lines.push("");
  for (const [edge, neighbours] of embedded) {
    lines.push(`  ${edge.padEnd(24)} ${neighbours.map((n) => n.id ?? "?").join("  ")}`);
  }
  return lines.join("\n");
}
