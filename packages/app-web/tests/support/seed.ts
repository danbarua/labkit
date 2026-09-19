import { readFileSync } from "node:fs";
import type { LabKitDB } from "@labkit/core-db/backend";
import { resolveTenantContext } from "@labkit/core-db/tenant";
import type { Transactor } from "@labkit/core-db/transactor";

/**
 * Two workspaces holding different data: `alpha`, which is tenant 1 and so the default, and
 * `beta`. `applySql` runs a script of several statements, which the two backends do differently.
 */
export async function seed(
  db: LabKitDB,
  tx: Transactor,
  applySql: (sql: string) => Promise<unknown>,
): Promise<void> {
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

  await applySql(readFileSync(new URL("../../queries/entity_as_hal.sql", import.meta.url), "utf8"));
}
