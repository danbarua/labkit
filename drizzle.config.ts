import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  entities: {
    // **Required for `pgPolicy` to be seen at all.** Without an
    // `entities.roles` key, drizzle-kit silently ignores role declarations in
    // the schema and generates a policy referring to a role it never creates.
    // There is no warning; the generated SQL simply fails to apply.
    //
    // The object form's `exclude` looks like the way to stop drizzle creating
    // `labkit_app` and is not: read in drizzle-kit 0.30.6, `excludeRoles` is
    // consumed only by the introspection path. The schema-side lever is
    // `pgRole(...).existing()` — see `src/db/schema.ts`.
    roles: true,
  },
});
