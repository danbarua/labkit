/**
 * What `labkit --version` says: where this binary came from.
 *
 *   0.7.470                          the v0.7.470 tag, exactly — a release
 *   0.7.470+3.g7c7cd1e               three commits past it
 *   0.7.470+3.g7c7cd1e.dirty         …with uncommitted changes
 *   0.7.470+3.g7c7cd1e (sharded-ci)  …and not on main
 */

import pkg from "../../package.json" with { type: "json" };

// Replaced at compile time by `scripts/build-binary.sh`, so a binary carries the provenance
// of the checkout it was built from rather than looking for a git it does not have.
declare const LABKIT_BUILD_VERSION: string;
const PLACEHOLDER = "@LABKIT_BUILD_VERSION@";

const git = (...args: string[]): string | undefined => {
  try {
    const run = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "ignore" });
    const out = run.stdout.toString().trim();
    return run.exitCode === 0 && out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
};

/**
 * `git describe`'s own shape, rewritten so the distance and the commit read as build
 * metadata rather than as a prerelease: `v1.2.3-4-gabcdef` sorts *below* `1.2.3` under
 * semver, which is the opposite of what it means.
 */
export function describeCheckout(): string | undefined {
  const described = git("describe", "--tags", "--dirty", "--match", "v*");
  if (!described) return undefined;
  const version = described
    .replace(/^v/, "")
    .replace(/-(\d+-g[0-9a-f]+)/, "+$1")
    .replaceAll("-", ".");
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  return branch === undefined || branch === "main" ? version : `${version} (${branch})`;
}

export const labkitVersion = (): string => {
  const built = typeof LABKIT_BUILD_VERSION === "string" ? LABKIT_BUILD_VERSION : PLACEHOLDER;
  if (!built.startsWith("@")) return built;
  return describeCheckout() ?? pkg.version;
};
