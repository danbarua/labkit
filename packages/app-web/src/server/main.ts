import { openRuntime } from "./runtime";
import { serve } from "./serve";

const runtime = openRuntime();
const server = serve(runtime, Number(process.env.LABKIT_PORT_WEB ?? 8899));

// Diagnostics go to stderr: stdout is a protocol channel elsewhere in this repo (check:stdout).
console.error(`labkit-web api ${server.url} worktree=${runtime.worktree}`);
