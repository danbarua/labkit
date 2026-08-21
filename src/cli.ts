#!/usr/bin/env bun
/**
 * A read-only CLI over the domain read surface (PJ-023's next phase).
 *
 * **Read-only on purpose, and structurally rather than by discipline.** It
 * constructs a `ReadSurface`, never a `ResearchSession`, so there is no write
 * verb in scope to call by accident. `src/domain/index.ts` exports the two
 * halves separately for exactly this.
 *
 * Four commands, not twenty. `023` set that bar and the reason holds: each one
 * is a question a researcher actually asks, and a surface that answers four
 * well is worth more than one that answers twenty at arm's length.
 */
import { connectDb } from "./db/connect";
import { resolveTenantContext } from "./db/tenant";
import { TenantGraph } from "./db/graph";
import { ReadSurface } from "./domain";

const USAGE = `labkit — read-only queries over a research record

  labkit known [--at <iso-instant>]   what the programme knows, now or as of a moment
  labkit why <proposition>            why a conclusion counts as supported
  labkit affects <artefact-or-name>   what depends on a record, if it turns out wrong
  labkit enquiry <enquiry-id>         is this enquiry open, and how did it close

Options
  --tenant <slug>   which tenant to read (default: labkit)
  --json            emit JSON instead of prose
`;

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

/**
 * Prose by default, JSON on request.
 *
 * The default matters: this surface exists so a researcher can ask a question
 * and read an answer, and a wall of JSON is a different product. `--json` is
 * for the caller that is a program.
 */
function show(json: boolean, value: unknown, prose: () => string): void {
  console.log(json ? JSON.stringify(value, null, 2) : prose());
}

function bullets(items: string[], empty: string): string {
  return items.length === 0 ? `  ${empty}` : items.map((i) => `  - ${i}`).join("\n");
}

export async function main(argv: string[] = Bun.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    console.log(USAGE);
    return command ? 0 : 1;
  }

  const json = argv.includes("--json");
  const connection = await connectDb();
  try {
    const ctx = await resolveTenantContext(connection.db, flag(argv, "tenant") ?? "labkit");
    const read = new ReadSurface(new TenantGraph(ctx, connection.db));

    switch (command) {
      case "known": {
        const at = flag(argv, "at");
        if (at) {
          const survey = await read.whatWasKnown(at);
          return show(json, survey, () =>
            [
              `As of ${survey.at}:`,
              "",
              "Established (resolved on a promoted finding)",
              bullets(survey.established.map((q) => q.asks), "nothing"),
              "",
              "Provisional (resolved, but on unpromoted work)",
              bullets(survey.provisional.map((q) => q.asks), "nothing"),
              "",
              "Accepted as unresolved",
              bullets(survey.accepted.map((q) => q.asks), "nothing"),
              "",
              "Open",
              bullets(survey.open.map((q) => q.asks), "nothing"),
              "",
              "`open` is not split into worked-on and untouched: nothing records",
              "when work began, so that cannot be placed in time.",
            ].join("\n"),
          ), 0;
        }
        const survey = await read.whatIsKnown();
        return show(json, survey, () =>
          [
            "Established",
            bullets(survey.established.map((q) => q.asks), "nothing"),
            "",
            "Provisional (resting on work nobody promoted)",
            bullets(survey.provisional.map((q) => q.asks), "nothing"),
            "",
            "Accepted as unresolved",
            bullets(survey.accepted.map((q) => q.asks), "nothing"),
            "",
            "Unresolved (worked on, no answer yet)",
            bullets(survey.unresolved.map((q) => q.asks), "nothing"),
            "",
            "Untested (nothing has been run against these)",
            bullets(survey.untested.map((q) => q.asks), "nothing"),
          ].join("\n"),
        ), 0;
      }

      case "why": {
        const proposition = rest.find((a) => !a.startsWith("--"));
        if (!proposition) return usageError("why needs a proposition");
        const why = await read.whySupported(proposition);
        return show(json, why, () =>
          [
            `"${why.proposition}"`,
            `  ${why.supported ? "supported" : "NOT supported"}, ${why.standing}`,
            why.promotedBecause ? `  promoted because: ${why.promotedBecause}` : "",
            "",
            "Resting on",
            bullets(why.support.map((s) => `${s.finding}  (via ${s.via})`), "nothing"),
            why.reverifiedBy.length
              ? `\nRe-checked by\n${bullets(why.reverifiedBy, "")}`
              : "",
            why.standard.length
              ? `\nHeld to\n${bullets(
                  why.standard.map((c) => `${c.proposition} — ${c.state}`),
                  "",
                )}`
              : "\nHeld to no prespecified standard.",
            why.unmet.length ? `\nNot currently met\n${bullets(why.unmet, "")}` : "",
            why.superseded.length
              ? `\nSuperseded\n${bullets(
                  why.superseded.map((s) => `${s.finding} — ${s.reason}`),
                  "",
                )}`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
        ), 0;
      }

      case "affects": {
        const subject = rest.find((a) => !a.startsWith("--"));
        if (!subject) return usageError("affects needs an artefact id or name");
        const report = await read.whatDependsOn(
          subject.startsWith("ART_") ? { kind: "observations", id: subject } : subject,
        );
        return show(json, report, () =>
          [
            "Claims that would be affected",
            bullets(report.claims, "none found"),
            "",
            "Lines of enquiry",
            bullets(report.enquiries, "none found"),
            "",
            "Routes walked",
            bullets(report.routesWalked, ""),
            "",
            "This is a lower bound, not a finding of independence: anything",
            "connected by a route not listed above is absent from these lists",
            "and is not thereby unaffected.",
          ].join("\n"),
        ), 0;
      }

      case "enquiry": {
        const id = rest.find((a) => !a.startsWith("--"));
        if (!id) return usageError("enquiry needs an enquiry id");
        const status = await read.enquiryStatus({ kind: "enquiry", id });
        return show(json, status, () =>
          [
            status.question,
            `  ${status.open ? "open" : `closed — ${status.closure}`}`,
            status.answer ? `  answer: ${status.answer}` : "",
            status.evidence?.length ? `\nEvidence\n${bullets(status.evidence, "")}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        ), 0;
      }

      default:
        return usageError(`unknown command: ${command}`);
    }
  } finally {
    await connection.close();
  }
}

function usageError(message: string): number {
  console.error(`labkit: ${message}\n`);
  console.error(USAGE);
  return 2;
}

if (import.meta.main) process.exit(await main());
