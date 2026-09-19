import { readFileSync } from "node:fs";
import { Client } from "pg";
import { directPostgresBackend } from "@labkit/core-db/backend";
import { runMigrationsOnPostgres } from "@labkit/core-db/migrate";
import { resolveTenantContext } from "@labkit/core-db/tenant";

export interface ScratchDb {
  /** A connection string for the new database. */
  url: string;
  drop(): Promise<void>;
}

const PREFIX = "labkit_web_test_";

/** The same server as `serverUrl`, on another database. */
function urlFor(serverUrl: string, database: string): string {
  const url = new URL(serverUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function seed(url: string): Promise<void> {
  const { db, tx, close } = await directPostgresBackend({ connectionString: url }).connect();
  try {
    const alpha = await resolveTenantContext(db, tx, "alpha");
    const beta = await resolveTenantContext(db, tx, "beta");
    // The default workspace is tenant 1, so the first one created has to be it.
    if (alpha.tenantId !== 1) throw new Error(`alpha is tenant ${alpha.tenantId}, not 1`);

    const cypher = (graph: string, body: string) =>
      db.query(
        `SELECT * FROM ag_catalog.cypher('${graph}'::name, $$${body}$$) AS (r ag_catalog.agtype)`,
      );

    await cypher(
      alpha.graphName,
      `CREATE (:Question {natural_id: 'Q_1', name: 'alpha question'}),
              (:Question {natural_id: 'Q_2', name: 'second alpha question'}),
              (:Question {natural_id: 'Q_3', name: 'retracted question', retracted: 'x'}),
              (:LineOfEnquiry {natural_id: 'LOE_1', name: 'alpha enquiry'}),
              (:EvidenceUnit {natural_id: 'EU_1', role: 'observation'}),
              (:Evidence {natural_id: 'EV_1', statement: 'alpha evidence'})`,
    );
    for (const edge of [
      "(a:Question {natural_id: 'Q_1'}), (b:LineOfEnquiry {natural_id: 'LOE_1'}) CREATE (a)-[:MOTIVATES]->(b)",
      "(a:EvidenceUnit {natural_id: 'EU_1'}), (b:LineOfEnquiry {natural_id: 'LOE_1'}) CREATE (a)-[:ADDRESSES]->(b)",
      "(a:EvidenceUnit {natural_id: 'EU_1'}), (b:Evidence {natural_id: 'EV_1'}) CREATE (a)-[:PRODUCES]->(b)",
    ]) {
      await cypher(alpha.graphName, `MATCH ${edge}`);
    }

    // The same handle as alpha's, with different content: the sharpest test of isolation.
    await cypher(beta.graphName, `CREATE (:Question {natural_id: 'Q_1', name: 'beta question'})`);
  } finally {
    await close();
  }

  const sql = readFileSync(new URL("../../queries/entity_as_hal.sql", import.meta.url), "utf8");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

/**
 * A throwaway database on the server `serverUrl` names, holding two workspaces with different
 * data: `alpha` (the default, tenant 1) and `beta`. Nothing else in it, so nothing a developer
 * has loaded can change a result.
 */
export async function createScratchDb(serverUrl: string): Promise<ScratchDb> {
  const name = `${PREFIX}${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const admin = async <T>(work: (client: Client) => Promise<T>): Promise<T> => {
    const client = new Client({ connectionString: urlFor(serverUrl, "postgres") });
    await client.connect();
    try {
      return await work(client);
    } finally {
      await client.end();
    }
  };

  await admin((client) => client.query(`CREATE DATABASE ${name}`));
  const url = urlFor(serverUrl, name);
  const migrator = new Client({ connectionString: url });
  await migrator.connect();
  try {
    await migrator.query("CREATE EXTENSION IF NOT EXISTS age");
    await runMigrationsOnPostgres(migrator);
  } finally {
    await migrator.end();
  }
  await seed(url);

  return {
    url,
    // The prefix is checked again at the point of dropping, so this can never name another database.
    drop: () =>
      admin((client) =>
        name.startsWith(PREFIX)
          ? client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
          : Promise.reject(new Error(`refusing to drop ${name}`)),
      ).then(() => undefined),
  };
}
