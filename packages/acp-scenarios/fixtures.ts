import type { CreateElicitationRequest } from "@agentclientprotocol/sdk";
import type { Answer, PermissionRequest, QuestionAnswer, Scenario } from "./scenario";
import {
  answerCutShort,
  newFile,
  noticesAndUsage,
  permissionRequired,
  planAndDiff,
  plainAnswer,
  questionAsked,
  sessionReplay,
  toolFails,
  toolImageResult,
  toolPlot,
  toolSucceeds,
  turnCancelled,
  turnFails,
} from "./scenarios";

/** A scenario with a fixed way of answering its permission requests: one state to draw or test. */
export interface Fixture {
  readonly id: string;
  readonly title: string;
  readonly scenario: Scenario;
  readonly decide: (request: PermissionRequest) => Answer;
  /** How the person answers the agent's questions; left open when not given. */
  readonly answer?: (request: CreateElicitationRequest) => QuestionAnswer;
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
  fixture(toolPlot),
  fixture(planAndDiff),
  fixture(newFile),
  fixture(turnFails),
  fixture(answerCutShort),
  fixture(turnCancelled),
  fixture(questionAsked),
  {
    ...fixture(questionAsked, never, "question-answered", "A question the person answered"),
    answer: () => ({
      action: "accept",
      content: { name: "seed-sweep-25", seeds: 25, optimiser: "adamw" },
    }),
  },
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
