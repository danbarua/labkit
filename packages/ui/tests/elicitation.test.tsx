/** A question from the agent: a form drawn from its schema, and the answers checked against it. */

import { describe, expect, test } from "bun:test";
import type { CreateElicitationRequest, ElicitationSchema } from "@agentclientprotocol/sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { ElicitationForm, problemsWith } from "../elicitation";

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

  test("lengths, patterns and formats", () => {
    expect(problemsWith(SCHEMA, { name: "ab", seeds: 1 }).name).toBe("At least 3 characters");
    expect(problemsWith(SCHEMA, { name: "Sweep 1", seeds: 1 }).name).toBe(
      "Not in the expected form",
    );
    expect(problemsWith(SCHEMA, { name: "abc", seeds: 1, contact: "nope" }).contact).toBe(
      "Should be an email address",
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

describe("a page to open", () => {
  test("names the site it opens before you open it", () => {
    const html = renderToStaticMarkup(
      <ElicitationForm
        request={{
          sessionId: "s",
          mode: "url",
          elicitationId: "e",
          message: "Sign in",
          url: "https://wandb.ai/authorize?x=1",
        }}
        onRespond={() => {}}
      />,
    );
    expect(html).toContain("Opens wandb.ai in your browser.");
    expect(html).toContain('href="https://wandb.ai/authorize?x=1" target="_blank"');
    expect(html).toContain("I&#x27;m done");
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
