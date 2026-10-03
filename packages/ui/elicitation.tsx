import {
  CreateElicitationRequest,
  type CreateElicitationResponse,
  type ElicitationPropertySchema,
  type ElicitationSchema,
} from "@agentclientprotocol/sdk";
import { useId, useState } from "react";

type Value = string | number | boolean | string[];
type Choice = { value: string; title: string; description?: string | null | undefined };

/**
 * A field's choices, whether the schema lists bare values (`enum`) or titled ones (`oneOf`, or
 * `anyOf` for a multi-select). A multi-select's items are choices only as `{type: "string", enum}`
 * or as untyped `{anyOf}`; items of any other type are not strings, whatever else they carry.
 */
function choicesOf(field: Record<string, unknown>): Choice[] | undefined {
  if (field.type === "array") {
    const items = (field.items ?? {}) as Record<string, unknown>;
    if (items.type === "string" || (items.type === undefined && Array.isArray(items.anyOf)))
      return choicesOf({ ...items, type: undefined });
    return undefined;
  }
  if (Array.isArray(field.oneOf))
    return (field.oneOf as { const: string; title: string; description?: string | null }[]).map(
      (o) => ({ value: o.const, title: o.title, description: o.description }),
    );
  if (Array.isArray(field.anyOf))
    return (field.anyOf as { const: string; title: string }[]).map((o) => ({
      value: o.const,
      title: o.title,
    }));
  if (Array.isArray(field.enum))
    return (field.enum as string[]).map((v) => ({ value: v, title: v }));
  return undefined;
}

const FORMAT_CHECK: Record<string, (v: string) => boolean> = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  uri: (v) => {
    try {
      new URL(v);
      return true;
    } catch {
      return false;
    }
  },
  date: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
  "date-time": (v) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i.test(v) &&
    !Number.isNaN(Date.parse(v)),
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A moment as RFC 3339 in the viewer's own offset: `2026-09-30T10:00:00+01:00`. A
 * `datetime-local` input gives neither seconds nor an offset, and JSON Schema's `date-time`
 * requires both.
 */
export function rfc3339(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** An RFC 3339 moment as a `datetime-local` input shows it, in the viewer's time. */
function asLocalInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return rfc3339(date).slice(0, 19);
}

type PatternVerdict = "match" | "no-match" | "invalid" | "timeout" | "unavailable";

// Runs in a worker so a pattern with catastrophic backtracking can be stopped: a regular
// expression on the page's own thread cannot be interrupted, and would freeze the page.
const PATTERN_WORKER = `onmessage = (e) => {
  let verdict;
  try { verdict = new RegExp(e.data.pattern).test(e.data.value) ? "match" : "no-match"; }
  catch { verdict = "invalid"; }
  postMessage(verdict);
};`;
let patternWorkerUrl: string | undefined;

/**
 * Whether `value` matches the agent's `pattern`, evaluated in a worker that is stopped after
 * `limitMs`. A pattern that does not compile is `invalid`; one that runs too long is `timeout`.
 * Where the page may not start a worker from a `blob:` address (a content security policy with
 * no `worker-src blob:`), the worker fails to load and the verdict is `unavailable`.
 */
export function checkPattern(
  pattern: string,
  value: string,
  limitMs = 250,
): Promise<PatternVerdict> {
  patternWorkerUrl ??= URL.createObjectURL(new Blob([PATTERN_WORKER], { type: "text/javascript" }));
  let worker: Worker;
  try {
    worker = new Worker(patternWorkerUrl);
  } catch {
    return Promise.resolve("unavailable");
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      worker.terminate();
      resolve("timeout");
    }, limitMs);
    worker.onmessage = (event: MessageEvent<PatternVerdict>) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      resolve("unavailable");
    };
    worker.postMessage({ pattern, value });
  });
}

/**
 * The fields whose answers do not match the agent's `pattern`. A pattern that does not compile,
 * runs past the time limit, or cannot be run here, cannot be held against the answer: it is
 * logged and the answer stands.
 */
export async function patternProblems(
  schema: ElicitationSchema,
  values: Readonly<Record<string, Value | undefined>>,
): Promise<Record<string, string>> {
  const checks = Object.entries(schema.properties ?? {}).flatMap(([name, raw]) => {
    const { type, pattern } = raw as Record<string, unknown>;
    const value = values[name];
    if (
      type !== "string" ||
      typeof pattern !== "string" ||
      typeof value !== "string" ||
      value === ""
    )
      return [];
    return [
      checkPattern(pattern, value).then((verdict) => {
        if (verdict !== "match" && verdict !== "no-match")
          console.warn("elicitation: the field's pattern could not be evaluated", {
            field: name,
            pattern,
            verdict,
            valueLength: value.length,
          });
        return [name, verdict] as const;
      }),
    ];
  });
  const problems: Record<string, string> = {};
  for (const [name, verdict] of await Promise.all(checks))
    if (verdict === "no-match") problems[name] = "Not in the expected form";
  return problems;
}

const FORMAT_WORDS: Record<string, string> = {
  email: "an email address",
  uri: "a web address",
  date: "a date",
  "date-time": "a date and time",
};

/**
 * What is wrong with each answer, by field, checked against the schema the agent sent: required
 * fields, lengths, ranges, formats and how many choices. Empty when all is well. Patterns are
 * checked apart, by `patternProblems`, since the agent's pattern needs a time limit.
 */
export function problemsWith(
  schema: ElicitationSchema,
  values: Readonly<Record<string, Value | undefined>>,
): Record<string, string> {
  const problems: Record<string, string> = {};
  const required = new Set(schema.required ?? []);
  for (const [name, raw] of Object.entries(schema.properties ?? {})) {
    const field = raw as ElicitationPropertySchema & Record<string, unknown>;
    const value = values[name];
    const empty =
      value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
    if (empty) {
      if (required.has(name)) problems[name] = "Required";
      continue;
    }
    if (field.type === "string" && typeof value === "string") {
      const { minLength, maxLength, format } = field as Record<string, unknown>;
      if (typeof minLength === "number" && value.length < minLength)
        problems[name] = `At least ${minLength} characters`;
      else if (typeof maxLength === "number" && value.length > maxLength)
        problems[name] = `At most ${maxLength} characters`;
      else if (typeof format === "string" && FORMAT_CHECK[format] && !FORMAT_CHECK[format](value))
        problems[name] = `Should be ${FORMAT_WORDS[format] ?? format}`;
    }
    if ((field.type === "number" || field.type === "integer") && typeof value === "number") {
      const { minimum, maximum } = field as Record<string, unknown>;
      if (field.type === "integer" && !Number.isInteger(value)) problems[name] = "A whole number";
      else if (typeof minimum === "number" && value < minimum)
        problems[name] = `At least ${minimum}`;
      else if (typeof maximum === "number" && value > maximum)
        problems[name] = `At most ${maximum}`;
    }
    if (field.type === "array" && Array.isArray(value)) {
      const { minItems, maxItems } = field as Record<string, unknown>;
      if (typeof minItems === "number" && value.length < minItems)
        problems[name] = `Choose at least ${minItems}`;
      else if (typeof maxItems === "number" && value.length > maxItems)
        problems[name] = `Choose at most ${maxItems}`;
    }
  }
  return problems;
}

function defaultsOf(schema: ElicitationSchema): Record<string, Value | undefined> {
  return Object.fromEntries(
    Object.entries(schema.properties ?? {}).map(([name, field]) => [
      name,
      ((field as Record<string, unknown>).default ?? undefined) as Value | undefined,
    ]),
  );
}

function Field({
  name,
  field,
  value,
  problem,
  required,
  onChange,
}: {
  name: string;
  field: ElicitationPropertySchema & Record<string, unknown>;
  value: Value | undefined;
  problem: string | undefined;
  required: boolean;
  onChange: (value: Value | undefined) => void;
}) {
  const id = useId();
  const label = (field.title as string | null | undefined) ?? name;
  const description = field.description as string | null | undefined;
  const choices = choicesOf(field);
  const head = (
    <>
      <label htmlFor={id} className="lk-field-label">
        {label}
        {required ? <span className="lk-field-required"> (required)</span> : null}
      </label>
      {description ? <p className="lk-field-hint">{description}</p> : null}
    </>
  );
  let control: React.ReactNode;
  if (field.type === "boolean")
    return (
      <div className="lk-field lk-field-check">
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        {head}
      </div>
    );
  if (field.type === "array" && choices)
    control = (
      <fieldset id={id} className="lk-field-choices">
        {choices.map((c) => {
          const picked = Array.isArray(value) && value.includes(c.value);
          return (
            <label key={c.value} className="lk-choice">
              <input
                type="checkbox"
                checked={picked}
                onChange={(e) => {
                  const now = Array.isArray(value) ? value : [];
                  onChange(e.target.checked ? [...now, c.value] : now.filter((v) => v !== c.value));
                }}
              />
              {c.title}
            </label>
          );
        })}
      </fieldset>
    );
  else if (field.type === "string" && choices)
    control = (
      <select
        id={id}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">Choose…</option>
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.title}
          </option>
        ))}
      </select>
    );
  else if (field.type === "number" || field.type === "integer")
    control = (
      <input
        id={id}
        type="number"
        step={field.type === "integer" ? 1 : "any"}
        value={typeof value === "number" ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    );
  else if (field.type === "string" && field.format === "date-time")
    control = (
      <input
        id={id}
        type="datetime-local"
        step={1}
        value={typeof value === "string" ? asLocalInput(value) : ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : rfc3339(new Date(e.target.value)))
        }
      />
    );
  else if (field.type === "string") {
    const format = field.format as string | null | undefined;
    const type =
      format === "email" ? "email" : format === "uri" ? "url" : format === "date" ? "date" : "text";
    control = (
      <input
        id={id}
        type={type}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      />
    );
  } else
    control = (
      <p id={id} className="lk-field-hint">
        This field ({String(field.type)}) cannot be answered here.
      </p>
    );
  return (
    <div className="lk-field" data-invalid={problem ? true : undefined}>
      {head}
      {control}
      {problem ? (
        <p className="lk-field-problem" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

/** The address to open, if it is an http or https URL; nothing else is opened. */
function webAddress(raw: string): URL | undefined {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The full address either side of its host, so the host can be marked. The host is the end of
 * the authority, which for http ends at the first `/` of the path; anything before it, such as
 * `good.example@` in `https://good.example@evil.example/`, is left unmarked.
 */
export function hostParts(url: URL): [string, string] {
  const end = url.href.indexOf("/", url.protocol.length + 2);
  return [url.href.slice(0, end - url.host.length), url.href.slice(end)];
}

/** A value the person gave, as they would read it back. */
const shownValue = (value: unknown): string =>
  Array.isArray(value)
    ? value.join(", ")
    : typeof value === "boolean"
      ? value
        ? "Yes"
        : "No"
      : String(value);

/**
 * A question the person has answered, as a record of the answer: what was sent (each field by its
 * title), or that they declined or cancelled. For a page to open, that it was opened, and whether
 * the agent has said the interaction behind it finished.
 */
export function ElicitationReceipt({
  request,
  response,
  completed = false,
}: {
  request: CreateElicitationRequest;
  response: CreateElicitationResponse;
  completed?: boolean;
}) {
  const fields = CreateElicitationRequest.isForm(request)
    ? (request.requestedSchema.properties ?? {})
    : {};
  const sent =
    response.action === "accept" && response.content
      ? Object.entries(response.content).map(([name, value]) => [
          (fields[name] as { title?: string } | undefined)?.title ?? name,
          shownValue(value),
        ])
      : [];
  const outcome =
    response.action === "decline"
      ? "Declined"
      : response.action === "cancel"
        ? "Cancelled"
        : CreateElicitationRequest.isUrl(request)
          ? completed
            ? "Opened, and finished"
            : "Opened; waiting for the agent to say it has finished"
          : "Sent";
  return (
    <section className="lk-elicitation answered" aria-label="Your answer">
      <p className="lk-elicitation-message">{request.message}</p>
      {sent.length === 0 ? null : (
        <dl className="lk-fields">
          {sent.map(([title, value]) => (
            <div key={title}>
              <dt>{title}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="lk-caption">{outcome}</p>
    </section>
  );
}

/**
 * A question from the agent, answered in the conversation: a form drawn from the flat schema it
 * sent (form mode), or a page to open (URL mode). The answers are checked against the schema and
 * sent typed as it says. Declining and cancelling are always there.
 *
 * In URL mode the full address is shown before anything opens. Opening it is the consent, so
 * `accept` is sent then; it does not mean the interaction is finished, which the agent reports
 * later with `elicitation/complete` (the `completed` prop).
 */
export function ElicitationForm({
  request,
  onRespond,
  completed = false,
}: {
  request: CreateElicitationRequest;
  onRespond?: ((response: CreateElicitationResponse) => void) | undefined;
  /** URL mode: the agent has said the interaction is finished (`elicitation/complete`). */
  completed?: boolean;
}) {
  const schema: ElicitationSchema = CreateElicitationRequest.isForm(request)
    ? request.requestedSchema
    : {};
  const [values, setValues] = useState(() => defaultsOf(schema));
  const [shown, setShown] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState(false);
  const [opened, setOpened] = useState(false);
  const respond = (response: CreateElicitationResponse) => onRespond?.(response);
  const actions = (
    <>
      <button
        type="button"
        className="lk-btn"
        disabled={!onRespond}
        onClick={() => respond({ action: "decline" })}
      >
        Decline
      </button>
      <button
        type="button"
        className="lk-btn"
        disabled={!onRespond}
        onClick={() => respond({ action: "cancel" })}
      >
        Cancel
      </button>
    </>
  );

  if (CreateElicitationRequest.isUrl(request)) {
    const url = webAddress(request.url);
    if (opened || completed)
      return (
        <section className="lk-elicitation" aria-label="The agent asks">
          <p className="lk-elicitation-message">{request.message}</p>
          <p className="lk-field-hint">
            {completed
              ? "Finished."
              : "Opened in your browser. The agent will say when it has finished."}
          </p>
          {completed || url === undefined ? null : (
            <div className="lk-actions">
              <a className="lk-btn" href={url.href} target="_blank" rel="noopener noreferrer">
                Open again
              </a>
            </div>
          )}
        </section>
      );
    return (
      <section className="lk-elicitation" aria-label="The agent asks">
        <p className="lk-elicitation-message">{request.message}</p>
        {url === undefined ? (
          <p className="lk-field-problem">
            This is not a web address this can open: <code>{request.url}</code>
          </p>
        ) : (
          <p className="lk-elicitation-url">
            <code>
              {hostParts(url)[0]}
              <strong>{url.host}</strong>
              {hostParts(url)[1]}
            </code>
          </p>
        )}
        <div className="lk-actions">
          <button
            type="button"
            className="lk-btn primary"
            disabled={!onRespond || url === undefined}
            onClick={() => {
              if (url === undefined) return;
              window.open(url.href, "_blank", "noopener,noreferrer");
              setOpened(true);
              respond({ action: "accept" });
            }}
          >
            Open
          </button>
          {actions}
        </div>
      </section>
    );
  }

  if (!CreateElicitationRequest.isForm(request))
    return (
      <section className="lk-elicitation" aria-label="The agent asks">
        <p className="lk-elicitation-message">{request.message}</p>
        <p className="lk-field-hint">
          The agent asks in a way this cannot answer ({String(request.mode)}).
        </p>
        <div className="lk-actions">{actions}</div>
      </section>
    );

  const required = new Set(schema.required ?? []);
  return (
    <form
      className="lk-elicitation"
      aria-label="The agent asks"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        setChecking(true);
        const problems = {
          ...(await patternProblems(schema, values)),
          ...problemsWith(schema, values),
        };
        setChecking(false);
        setShown(problems);
        if (Object.keys(problems).length > 0) return;
        const content = Object.fromEntries(
          Object.entries(values).filter(([, v]) => v !== undefined && v !== ""),
        ) as Record<string, Value>;
        respond({ action: "accept", content });
      }}
    >
      <p className="lk-elicitation-message">{request.message}</p>
      {schema.description ? <p className="lk-field-hint">{schema.description}</p> : null}
      {Object.entries(schema.properties ?? {}).map(([name, field]) => (
        <Field
          key={name}
          name={name}
          field={field as ElicitationPropertySchema & Record<string, unknown>}
          value={values[name]}
          problem={shown[name]}
          required={required.has(name)}
          onChange={(value) => {
            setValues((prev) => ({ ...prev, [name]: value }));
            setShown((prev) => {
              const { [name]: _gone, ...rest } = prev;
              return rest;
            });
          }}
        />
      ))}
      <div className="lk-actions">
        <button type="submit" className="lk-btn primary" disabled={!onRespond || checking}>
          Send
        </button>
        {actions}
      </div>
    </form>
  );
}
