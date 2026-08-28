# Spike: labkit-rust

## Concept

Port the `labkit` bun [cli](../../src/cli/cli.ts) + PGLite/Postgres/Apache-AGE application to Rust + [Grafeo](https://github.com/GrafeoDB/grafeo).

## Parity Smoke Tests

Verify like-for-like output between bun binary and rust port with these two scripts.
- [smoke-cli](../../scripts/smoke-cli.sh)
- [end-to-end](../../examples/full-lifecycle.sh)

