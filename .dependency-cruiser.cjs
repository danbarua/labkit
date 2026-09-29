/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "No module imports itself at runtime through a chain of others. Type-only imports are erased.",
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ["type-only"] } },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      comment:
        "Every import resolves. An import of a package its own package.json does not declare does not.",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "persistence-knows-no-domain",
      severity: "error",
      comment: "core-db holds nodes and edges; core-domain holds research actions built on them.",
      from: { path: "^packages/core-db/" },
      to: { path: "^packages/core-domain/" },
    },
    {
      name: "scenarios-no-persistence",
      severity: "error",
      comment:
        "An acceptance scenario uses research verbs only. One that needs core-db has found a missing verb.",
      from: { path: "^tests/scenarios/" },
      to: { path: "^packages/core-db/" },
    },
    {
      name: "consumer-probe-no-persistence",
      severity: "error",
      comment: "A consumer probe answers from the public read surface, not from the graph.",
      from: { path: "^tests/consumer/" },
      to: { path: "^packages/core-db/" },
    },
    {
      name: "reads-do-not-write",
      severity: "error",
      comment: "core-domain's read verbs do not import its write verbs; shared helpers are in core.ts.",
      from: { path: "^packages/core-domain/read(/|\\.ts$)" },
      to: { path: "^packages/core-domain/write(/|\\.ts$)" },
    },
    {
      name: "writes-do-not-read",
      severity: "error",
      comment: "core-domain's write verbs do not import its read verbs; shared helpers are in core.ts.",
      from: { path: "^packages/core-domain/write(/|\\.ts$)" },
      to: { path: "^packages/core-domain/read(/|\\.ts$)" },
    },
    {
      name: "core-knows-no-verbs",
      severity: "error",
      comment: "core.ts is what both verb surfaces share, so it imports neither.",
      from: { path: "^packages/core-domain/core\\.ts$" },
      to: { path: "^packages/core-domain/(read|write|session)(/|\\.ts$)" },
    },
    {
      name: "an-app-does-not-assemble-a-session",
      severity: "error",
      comment:
        "openRecord in core-domain connects, resolves the tenant and builds the graph; the CLI and MCP server call it.",
      from: { path: "^packages/app-(cli|mcp)/" },
      to: { path: "^packages/core-db/(tenant|scoped|graph)" },
    },
    {
      name: "only-apps-import-apps",
      severity: "error",
      comment: "An app-* package is a composition root: other packages do not depend on one.",
      from: { path: "^packages/", pathNot: "^packages/app-" },
      to: { path: "^packages/app-" },
    },
    {
      name: "shared-ui-knows-no-core",
      severity: "error",
      comment:
        "The chat UI stack draws ACP session updates, whatever agent sent them and whatever app hosts it.",
      from: { path: "^packages/(view-model|acp-client|ui|design|records)/" },
      to: { path: "^packages/(core-|app-)" },
    },
  ],
  options: {
    doNotFollow: { path: ["node_modules"] },
    exclude: {
      path: ["(^|/)node_modules/", "(^|/)dist/", "(^|/)\\.session-artifacts/", "routeTree\\.gen\\.ts$"],
    },
    parser: "swc",
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
    skipAnalysisNotInRules: true,
  },
};
