import type { LabKitDB } from "@labkit/core-db/backend";
import { resolveTenantContext } from "@labkit/core-db/tenant";
import type { Transactor } from "@labkit/core-db/transactor";

/**
 * Two workspaces holding different data: `alpha`, which is tenant 1 and so the default, and
 * `beta`.
 */
export async function seed(db: LabKitDB, tx: Transactor): Promise<void> {
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
    // Carries a property, so a resource on either end can assert `_links` shows it.
    "(a:EvidenceUnit {natural_id: 'EU_1'}), (b:LineOfEnquiry {natural_id: 'LOE_1'}) CREATE (a)-[:ADDRESSES {weight: 1}]->(b)",
    "(a:EvidenceUnit {natural_id: 'EU_1'}), (b:Evidence {natural_id: 'EV_1'}) CREATE (a)-[:PRODUCES]->(b)",
  ]) {
    await cypher(alpha.graphName, `MATCH ${edge}`);
  }

  // The same handle as alpha's, with different content: the sharpest test of isolation.
  await cypher(beta.graphName, `CREATE (:Question {natural_id: 'Q_1', name: 'beta question'})`);

  // Two acts in alpha's log, written the way the CLI writes them. The second is a note about Q_1
  // whose subject is the note, so only a change reaches Q_1.
  const record = (payload: Record<string, unknown>) =>
    db.query(`SELECT public.labkit_record_event($1::text, $2::int, $3::jsonb)`, [
      alpha.graphName,
      alpha.tenantId,
      JSON.stringify({
        attribution_label: "tester",
        attribution_id: "test:1",
        attribution_how: "claimed",
        git_hash: null,
        reconstructed_from: null,
        ...payload,
      }),
    ]);
  await record({
    at: "2026-01-01T00:00:00.000Z",
    operation: "pose",
    subject: "Q_1",
    command: { question: "alpha question" },
    changes: [
      { change: "NodeCreated", id: "Q_1", label: "Question", props: { name: "alpha question" } },
    ],
  });
  await record({
    at: "2026-01-01T00:01:00.000Z",
    operation: "note",
    subject: "NOTE_1",
    command: { on: "Q_1", text: "worth revisiting" },
    changes: [
      { change: "NodeCreated", id: "NOTE_1", label: "Note", props: { text: "worth revisiting" } },
      { change: "EdgeCreated", from: "NOTE_1", label: "CONCERNS", to: "Q_1" },
    ],
  });

  // An act about LOE_1 whose only change lands on Q_2: it names Q_2 and not its own subject.
  await record({
    at: "2026-01-01T00:02:00.000Z",
    operation: "undo",
    subject: "LOE_1",
    command: { event: 2 },
    changes: [{ change: "NodePropsChanged", id: "Q_2", before: {}, after: { retracted: true } }],
  });
}
