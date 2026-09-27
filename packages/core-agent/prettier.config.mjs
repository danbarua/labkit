/**
 * Formats the journal fixture baselines that `session/fixture-runner.ts` writes. The rest of the
 * repository is formatted by Biome, which is told to leave the fixtures directory alone.
 *
 * @type {import("prettier").Config}
 */
export default {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  singleQuote: false,
  semi: true,
  trailingComma: "all",
  overrides: [{ files: ["*.json"], options: { trailingComma: "none" } }],
};
