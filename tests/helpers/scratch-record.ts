import { afterAll, beforeAll } from "bun:test";

/**
 * Takes `LABKIT_DB_URL` out of the environment for this file.
 *
 * `connectDb` reads it before it looks at `--db`, so a test driving the CLI against a
 * temporary directory runs against the shared server instead — seeing other tests' records,
 * and writing into theirs.
 */
export function ignoreLabkitDbUrl(): void {
  const server = process.env.LABKIT_DB_URL;
  beforeAll(() => {
    delete process.env.LABKIT_DB_URL;
  });
  afterAll(() => {
    if (server !== undefined) process.env.LABKIT_DB_URL = server;
  });
}
