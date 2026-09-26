import { FIXTURES } from "@labkit/acp-scenarios";
import { Conversation } from "@labkit/ui";
import "@labkit/ui/ui.css";
import type { TranscriptState } from "@labkit/view-model";
import { stateOfFixture } from "@labkit/view-model/fixtures";
import { useEffect, useState } from "react";
import { Bar } from "./Bar";

type Theme = "system" | "light" | "dark";

/**
 * Every state in the shared corpus drawn at once: the surface to look at when a component changes,
 * and the same states the tests assert on. Handlers are wired to nothing, so nothing here sends.
 */
export default function Gallery() {
  const [states, setStates] = useState<Record<string, TranscriptState>>({});
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    let abandoned = false;
    Promise.all(FIXTURES.map(async (f) => [f.id, await stateOfFixture(f)] as const)).then(
      (entries) => {
        if (!abandoned) setStates(Object.fromEntries(entries));
      },
    );
    return () => {
      abandoned = true;
    };
  }, []);

  return (
    <>
      <Bar>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {(["system", "light", "dark"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTheme(t)} disabled={theme === t}>
              {t}
            </button>
          ))}
        </span>
      </Bar>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: 16,
          display: "grid",
          gap: 20,
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 520px), 1fr))",
          alignContent: "start",
        }}
      >
        {FIXTURES.map((fixture) => {
          const state = states[fixture.id];
          return (
            <section key={fixture.id} aria-label={fixture.title}>
              <h3 style={{ margin: "0 0 6px", fontSize: 13 }}>
                {fixture.title} <code style={{ color: "var(--text-dim)" }}>{fixture.id}</code>
              </h3>
              <div style={{ height: 480, border: "1px solid var(--panel-border)" }}>
                {state === undefined ? null : (
                  <Conversation state={state} {...(theme === "system" ? {} : { theme })} />
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
