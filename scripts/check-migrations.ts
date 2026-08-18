// scripts/check-migrations.ts
// https://medium.com/@2nick2patel2/typescript-safe-sql-migrations-with-dbmate-prisma-compile-time-guards-for-ddl-d387e9a070cc
import fs from "node:fs";
import path from "node:path";

// drizzle-kit's output folder — both auto-generated migrations and
// hand-written `--custom` ones (e.g. the AGE graph/natural-id migrations)
// land here and are scanned identically; drizzle-kit's own `meta/*.json`
// files are skipped by the `.sql` filter below, not by this path.
const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

// Simple patterns: practical, not perfect.
const FORBIDDEN_BY_DEFAULT = [
  /drop\s+table/i,
  /drop\s+column/i,
];

const REQUIRE_COMMENT_FOR = [
  { pattern: /alter\s+table/i, tag: "-- lock-strategy:" },
];

function readMigrations() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith(".sql"))
    .sort();
  return files.map(f => ({
    name: f,
    sql: fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"),
  }));
}

function fail(msg: string) {
  console.error(msg);
  process.exit(1);
}

const migrations = readMigrations();

for (const m of migrations) {
  // 1) Block destructive ops unless explicitly allowed
  for (const rx of FORBIDDEN_BY_DEFAULT) {
    if (rx.test(m.sql) && !m.sql.includes("-- allow-destructive")) {
      fail(
        `❌ check-migrations ERROR: ${m.name} contains destructive DDL (${rx}). ` +
        `Add "-- allow-destructive" with justification, or refactor to a safe pattern.`
      );
    }
  }

  // 2) Require operational notes for risky ops
  for (const rule of REQUIRE_COMMENT_FOR) {
    if (rule.pattern.test(m.sql) && !m.sql.includes(rule.tag)) {
      fail(
        `❌ check-migration ERROR: ${m.name} contains "${rule.pattern}" but is missing "${rule.tag}". ` +
        `Example: "-- lock-strategy: online/low-traffic/backfill/batched"`
      );
    }
  }
}

console.log("✅ check-migrations OK: Migration policy checks passed.");