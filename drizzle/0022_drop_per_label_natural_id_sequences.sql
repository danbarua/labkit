-- lock-strategy: online
-- Drops the per-label natural-id sequences in `public` (13 from 0002, `note` from 0007) and
-- `labkit_next_natural_id`, the only function that read them. Ids come from the workspace's
-- own `<workspace>.labkit_natural_id_seq` through `labkit_next_workspace_id`.
--
-- Dropping an object drops the privileges granted on it, so no REVOKE is needed.
DROP FUNCTION IF EXISTS public.labkit_next_natural_id(text, text);
--> statement-breakpoint
DROP SEQUENCE IF EXISTS
  public.labkit_question_natural_id_seq,
  public.labkit_lineofenquiry_natural_id_seq,
  public.labkit_evidenceunit_natural_id_seq,
  public.labkit_evidence_natural_id_seq,
  public.labkit_claim_natural_id_seq,
  public.labkit_decision_natural_id_seq,
  public.labkit_criterion_natural_id_seq,
  public.labkit_criterionevaluation_natural_id_seq,
  public.labkit_gate_natural_id_seq,
  public.labkit_review_natural_id_seq,
  public.labkit_artefact_natural_id_seq,
  public.labkit_computation_natural_id_seq,
  public.labkit_task_natural_id_seq,
  public.labkit_note_natural_id_seq;
