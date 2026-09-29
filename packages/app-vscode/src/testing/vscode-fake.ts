type FakeUri = { toString(skipEncoding?: boolean): string };

/**
 * The `vscode` module for tests. Every test file registers this object and no other:
 * `mock.module("vscode", () => vscodeFake)`. Bun fixes a mocked module's export names at the
 * first `mock.module` of a run; a later call changes their values but cannot add names. A file
 * with its own, smaller fake breaks every file that runs after it and needs an export it left
 * out, and which files those are depends on the run's file order.
 *
 * A test that needs different behaviour spies on a function here and restores it afterwards.
 */
export const vscodeFake = {
  Uri: {
    joinPath: (base: unknown, ...parts: string[]) => ({ base, parts }),
    parse: (value: string): FakeUri => ({ toString: () => value }),
  },
  ViewColumn: { Active: -1 },
  env: {
    asExternalUri: async (uri: FakeUri): Promise<FakeUri> => uri,
  },
  window: {
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    createWebviewPanel: (..._args: unknown[]): unknown => {
      throw new Error("createWebviewPanel: spy on it to supply a panel");
    },
    showErrorMessage: async (_message: string): Promise<undefined> => undefined,
  },
  workspace: {
    getConfiguration: () => ({ get: (_name: string, fallback: unknown) => fallback }),
  },
};
