import type { Answer, PermissionRequest, Scenario } from "./scenario";
import {
  noticesAndUsage,
  permissionRequired,
  planAndDiff,
  plainAnswer,
  sessionReplay,
  toolFails,
  toolImageResult,
  toolSucceeds,
} from "./scenarios";

/** A scenario with a fixed way of answering its permission requests: one state to draw or test. */
export interface Fixture {
  readonly id: string;
  readonly title: string;
  readonly scenario: Scenario;
  readonly decide: (request: PermissionRequest) => Answer;
}

const never = (): Answer => "hold";

const choose = (optionId: string) => (): Answer => ({ optionId });

const fixture = (
  scenario: Scenario,
  decide: Fixture["decide"] = never,
  id = scenario.id,
  title = scenario.title,
): Fixture => ({ id, title, scenario, decide });

export const FIXTURES: readonly Fixture[] = [
  fixture(plainAnswer),
  fixture(toolSucceeds),
  fixture(toolFails),
  fixture(toolImageResult),
  fixture(planAndDiff),
  fixture(sessionReplay),
  fixture(noticesAndUsage),
  fixture(permissionRequired, never, "permission-pending", "Waiting for a permission answer"),
  fixture(
    permissionRequired,
    choose("allow_once"),
    "permission-granted",
    "Permission granted once",
  ),
  fixture(
    permissionRequired,
    choose("allow_always"),
    "permission-granted-for-session",
    "Permission granted for the session",
  ),
  fixture(permissionRequired, choose("reject_once"), "permission-refused", "Permission refused"),
  fixture(
    permissionRequired,
    () => "cancel",
    "permission-cancelled",
    "Cancelled while waiting for permission",
  ),
];
