/**
 * The agent the dev server mounts at `/acp`: the fake agent by default, or a real one when
 * `LABKIT_ACP_AGENT_URL` names it.
 */
export const AGENT_URL = "/acp";

/**
 * The directory a real agent keeps its sessions for, set by `dev-with-agent.ts`. The fake agent
 * ignores it, and it is unset when the fake agent runs.
 */
export const AGENT_CWD = import.meta.env.VITE_LABKIT_ACP_CWD as string | undefined;
