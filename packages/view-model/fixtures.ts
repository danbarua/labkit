/**
 * The scenario corpus as view events and views. Kept out of the package's main entry so a page
 * that only reduces a live session does not carry the scripts.
 */

import { type Fixture, play, promptResponse } from "@labkit/acp-scenarios";
import { initialState, type TranscriptState } from "./state";
import { promptEnded, replay, type ViewEvent } from "./reduce";

/** The events a client would see for a fixture: its own prompt, the agent's updates, its answers. */
export async function eventsOfFixture(fixture: Fixture): Promise<ViewEvent[]> {
  const events: ViewEvent[] = [];
  const { scenario } = fixture;
  if (scenario.prompt !== "") {
    events.push({ type: "prompt_started", content: [{ type: "text", text: scenario.prompt }] });
  }
  let count = 0;
  const stopReason = await play(scenario, {
    update: (update) => {
      events.push({ type: "update", update });
    },
    permission: (request) => {
      const requestId = `permission-${++count}`;
      events.push({ type: "permission_requested", requestId, request });
      const answer = fixture.decide(request);
      if (answer === "cancel") {
        events.push({ type: "permission_answered", requestId, outcome: { outcome: "cancelled" } });
      } else if (answer !== "hold") {
        events.push({
          type: "permission_answered",
          requestId,
          outcome: { outcome: "selected", optionId: answer.optionId },
        });
      }
      return answer;
    },
  });
  if (scenario.fails) events.push({ type: "failed", message: scenario.fails.message });
  else if (stopReason !== undefined) events.push(promptEnded(promptResponse(scenario, stopReason)));
  return events;
}

/** What a fixture looks like once every event has been reduced. */
export async function stateOfFixture(fixture: Fixture): Promise<TranscriptState> {
  return replay(await eventsOfFixture(fixture), initialState);
}
