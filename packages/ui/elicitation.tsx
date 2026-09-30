import {
  CreateElicitationRequest,
  type CreateElicitationResponse,
  type ElicitationPropertySchema,
  type ElicitationSchema,
} from "@agentclientprotocol/sdk";
import { useId, useState } from "react";

type Value = string | number | boolean | string[];
type Choice = { value: string; title: string; description?: string | null | undefined };

/** A field's choices, whether the schema lists bare values (`enum`) or titled ones (`oneOf`). */
function choicesOf(field: Record<string, unknown>): Choice[] | undefined {
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
  "date-time": (v) => !Number.isNaN(Date.parse(v)),
};

const FORMAT_WORDS: Record<string, string> = {
  email: "an email address",
  uri: "a web address",
  date: "a date",
  "date-time": "a date and time",
};

/**
 * What is wrong with each answer, by field, checked against the schema the agent sent: required
 * fields, lengths, patterns, ranges, formats and how many choices. Empty when all is well.
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
      const { minLength, maxLength, pattern, format } = field as Record<string, unknown>;
      if (typeof minLength === "number" && value.length < minLength)
        problems[name] = `At least ${minLength} characters`;
      else if (typeof maxLength === "number" && value.length > maxLength)
        problems[name] = `At most ${maxLength} characters`;
      else if (typeof pattern === "string" && !new RegExp(pattern).test(value))
        problems[name] = "Not in the expected form";
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
  const choices = choicesOf(
    field.type === "array" ? ((field.items as Record<string, unknown>) ?? {}) : field,
  );
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
  else if (field.type === "string") {
    const format = field.format as string | null | undefined;
    const type =
      format === "email"
        ? "email"
        : format === "uri"
          ? "url"
          : format === "date"
            ? "date"
            : format === "date-time"
              ? "datetime-local"
              : "text";
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

/**
 * A question from the agent, answered in the conversation: a form drawn from the flat schema it
 * sent (form mode), or a page to open (URL mode). The answers are checked against the schema and
 * sent typed as it says. Declining and cancelling are always there.
 */
export function ElicitationForm({
  request,
  onRespond,
}: {
  request: CreateElicitationRequest;
  onRespond?: ((response: CreateElicitationResponse) => void) | undefined;
}) {
  const schema: ElicitationSchema = CreateElicitationRequest.isForm(request)
    ? request.requestedSchema
    : {};
  const [values, setValues] = useState(() => defaultsOf(schema));
  const [shown, setShown] = useState<Record<string, string>>({});
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
    const host = (() => {
      try {
        return new URL(request.url).host;
      } catch {
        return request.url;
      }
    })();
    return (
      <section className="lk-elicitation" aria-label="The agent asks">
        <p className="lk-elicitation-message">{request.message}</p>
        <p className="lk-field-hint">Opens {host} in your browser.</p>
        <div className="lk-actions">
          <a className="lk-btn primary" href={request.url} target="_blank" rel="noreferrer">
            Open
          </a>
          <button
            type="button"
            className="lk-btn"
            disabled={!onRespond}
            onClick={() => respond({ action: "accept" })}
          >
            I'm done
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
      onSubmit={(event) => {
        event.preventDefault();
        const problems = problemsWith(schema, values);
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
        <button type="submit" className="lk-btn primary" disabled={!onRespond}>
          Send
        </button>
        {actions}
      </div>
    </form>
  );
}
