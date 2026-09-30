/** A question from the agent: a form drawn from its schema, and the answers checked against it. */

import { describe, expect, test } from "bun:test";
import type { CreateElicitationRequest, ElicitationSchema } from "@agentclientprotocol/sdk";
import { renderToStaticMarkup } from "react-dom/server";
import {
  checkPattern,
  ElicitationForm,
  hostParts,
  patternProblems,
  problemsWith,
  rfc3339,
} from "../elicitation";

const SCHEMA: ElicitationSchema = {
  type: "object",
  required: ["name", "seeds"],
  properties: {
    name: { type: "string", title: "Run name", minLength: 3, pattern: "^[a-z-]+$" },
    contact: { type: "string", format: "email" },
    seeds: { type: "integer", minimum: 1, maximum: 10 },
    optimiser: {
      type: "string",
      oneOf: [
        { const: "adamw", title: "AdamW" },
        { const: "sgd", title: "SGD" },
      ],
    },
    datasets: {
      type: "array",
      minItems: 1,
      maxItems: 2,
      items: { type: "string", enum: ["a", "b", "c"] },
    },
    dryRun: { type: "boolean", title: "Dry run first", default: true },
  },
};

const form = (requestedSchema: ElicitationSchema): CreateElicitationRequest => ({
  sessionId: "s",
  mode: "form",
  message: "A few settings",
  requestedSchema,
});

describe("checking answers against the schema", () => {
  test("answers that satisfy every constraint have no problems", () => {
    expect(
      problemsWith(SCHEMA, { name: "sweep", seeds: 3, contact: "a@b.io", datasets: ["a"] }),
    ).toEqual({});
  });

  test("a required field left empty is named, an optional one is not", () => {
    expect(problemsWith(SCHEMA, { name: "", contact: undefined })).toEqual({
      name: "Required",
      seeds: "Required",
    });
  });

  test("lengths and formats", () => {
    expect(problemsWith(SCHEMA, { name: "ab", seeds: 1 }).name).toBe("At least 3 characters");
    expect(problemsWith(SCHEMA, { name: "abc", seeds: 1, contact: "nope" }).contact).toBe(
      "Should be an email address",
    );
  });

  test("a date-time is RFC 3339: seconds and an offset", () => {
    const at: ElicitationSchema = {
      type: "object",
      properties: { at: { type: "string", format: "date-time" } },
    };
    expect(problemsWith(at, { at: "2026-09-30T10:00" }).at).toBe("Should be a date and time");
    expect(problemsWith(at, { at: "2026-09-30T10:00:00+01:00" })).toEqual({});
    expect(problemsWith(at, { at: "2026-09-30T09:00:00Z" })).toEqual({});
    expect(rfc3339(new Date(2026, 8, 30, 10, 0, 5))).toMatch(
      /^2026-09-30T10:00:05[+-]\d{2}:\d{2}$/,
    );
  });

  test("ranges, whole numbers and how many choices", () => {
    expect(problemsWith(SCHEMA, { name: "abc", seeds: 11 }).seeds).toBe("At most 10");
    expect(problemsWith(SCHEMA, { name: "abc", seeds: 2.5 }).seeds).toBe("A whole number");
    expect(problemsWith(SCHEMA, { name: "abc", seeds: 1, datasets: ["a", "b", "c"] })).toEqual({
      datasets: "Choose at most 2",
    });
  });
});

describe("the agent's pattern", () => {
  test("an answer that does not match is a problem", async () => {
    expect(await patternProblems(SCHEMA, { name: "Sweep 1" })).toEqual({
      name: "Not in the expected form",
    });
    expect(await patternProblems(SCHEMA, { name: "sweep" })).toEqual({});
  });

  test("a pattern that backtracks without end is stopped, and the page goes on", async () => {
    const started = performance.now();
    expect(await checkPattern("^(a+)+$", `${"a".repeat(40)}!`, 100)).toBe("timeout");
    expect(performance.now() - started).toBeLessThan(1000);
  });

  test("where no worker can start, the pattern is unavailable and the answer stands", async () => {
    const real = globalThis.Worker;
    globalThis.Worker = class {
      constructor() {
        throw new Error("refused by the content security policy");
      }
    } as unknown as typeof Worker;
    try {
      expect(await checkPattern("^a$", "b")).toBe("unavailable");
      expect(await patternProblems(SCHEMA, { name: "Sweep 1" })).toEqual({});
    } finally {
      globalThis.Worker = real;
    }
  });

  test("a pattern that does not compile is not held against the answer", async () => {
    expect(await checkPattern("(", "x")).toBe("invalid");
    const broken: ElicitationSchema = {
      type: "object",
      properties: { x: { type: "string", pattern: "(" } },
    };
    expect(await patternProblems(broken, { x: "anything" })).toEqual({});
  });
});

describe("the form", () => {
  const html = renderToStaticMarkup(
    <ElicitationForm request={form(SCHEMA)} onRespond={() => {}} />,
  );

  test("each kind of field gets its control", () => {
    expect(html).toContain('type="email"');
    expect(html).toContain('type="number"');
    expect(html).toContain('<option value="adamw">AdamW</option>');
    expect(html.match(/type="checkbox"/g)?.length).toBe(4); // three datasets and the dry run
  });

  test("required fields say so, and defaults are filled in", () => {
    expect(html).toContain('Run name<span class="lk-field-required"> (required)</span>');
    expect(html).toMatch(/type="checkbox" checked=""/);
  });

  test("it can always be declined or cancelled", () => {
    expect(html).toContain(">Send</button>");
    expect(html).toContain(">Decline</button>");
    expect(html).toContain(">Cancel</button>");
  });

  test("without a way to answer, the buttons are disabled", () => {
    const inert = renderToStaticMarkup(<ElicitationForm request={form(SCHEMA)} />);
    expect(inert).toContain('<button type="submit" class="lk-btn primary" disabled="">Send');
  });
});

const urlRequest = (url: string): CreateElicitationRequest => ({
  sessionId: "s",
  mode: "url",
  elicitationId: "e",
  message: "Sign in",
  url,
});

describe("a page to open", () => {
  test("shows the full address, with its host marked, before anything opens", () => {
    const html = renderToStaticMarkup(
      <ElicitationForm
        request={urlRequest("https://wandb.ai/authorize?x=1")}
        onRespond={() => {}}
      />,
    );
    expect(html).toContain("https://<strong>wandb.ai</strong>/authorize?x=1");
    expect(html).toContain(">Open</button>");
    expect(html).not.toContain("I&#x27;m done");
  });

  test("the host marked is the real one, not a lookalike before an @", () => {
    expect(hostParts(new URL("https://good.example@evil.example/x"))).toEqual([
      "https://good.example@",
      "/x",
    ]);
  });

  test("only web addresses can be opened", () => {
    const html = renderToStaticMarkup(
      <ElicitationForm request={urlRequest("javascript:alert(1)")} onRespond={() => {}} />,
    );
    expect(html).toContain("not a web address this can open");
    expect(html).toMatch(/<button type="button" class="lk-btn primary" disabled="">Open/);
  });

  test("once the agent says it has finished, that is all it shows", () => {
    const html = renderToStaticMarkup(
      <ElicitationForm request={urlRequest("https://wandb.ai/")} completed onRespond={() => {}} />,
    );
    expect(html).toContain("Finished.");
    expect(html).not.toContain("<button");
  });
});

describe("multi-select items", () => {
  test("items of a type this does not know are not offered as strings", () => {
    const odd: ElicitationSchema = {
      type: "object",
      properties: {
        picks: { type: "array", items: { type: "_colour", enum: ["red", "blue"] } },
      },
    };
    const html = renderToStaticMarkup(<ElicitationForm request={form(odd)} onRespond={() => {}} />);
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain("cannot be answered here");
  });

  test("titled items are offered by title", () => {
    const titled: ElicitationSchema = {
      type: "object",
      properties: {
        picks: { type: "array", items: { anyOf: [{ const: "r", title: "Red" }] } },
      },
    };
    const html = renderToStaticMarkup(
      <ElicitationForm request={form(titled)} onRespond={() => {}} />,
    );
    expect(html).toContain('type="checkbox"/>Red');
  });
});

describe("a kind of question this does not know", () => {
  test("shows the message and still lets you decline", () => {
    const html = renderToStaticMarkup(
      <ElicitationForm
        request={{ sessionId: "s", mode: "_survey", message: "Rate me" }}
        onRespond={() => {}}
      />,
    );
    expect(html).toContain("Rate me");
    expect(html).toContain("cannot answer (_survey)");
    expect(html).toContain(">Decline</button>");
  });
});
