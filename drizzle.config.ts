import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // **Required for `pgRole`/`pgPolicy` to be seen at all.** Without an
  // `entities.roles` key, drizzle-kit silently ignores role declarations in the
  // schema and generates a policy referring to a role it never creates. There
  // is no warning; the generated SQL simply fails to apply.
  entities: { roles: true },
});
