//! Slice 1 of the LabKit CLI, on Grafeo's **typed** API.
//!
//! Five commands — `criterion`, `open`, `plan`, `declare`, `known`, `gate` —
//! reproducing `parity/slice-1.expected` byte for byte. Run the diff rather
//! than reading two terminals:
//!
//! ```sh
//! bash parity/slice-1.sh cargo run --quiet -- | diff - parity/slice-1.expected
//! ```
//!
//! ## Why typed calls and not Cypher
//!
//! Grafeo speaks both. Cypher would be the faithful transliteration, and it is
//! the *less* interesting bet: LabKit's `src/domain/facts.ts` — a fact graph
//! that composes Cypher clauses — exists because a clause spelled twice gets
//! spelled wrong once. That defect was found six times in one codebase, four
//! by the same author, twice *after* the fix for the previous occurrence.
//!
//! `create_edge_with_props(gate, criterion, "GOVERNS", …)` cannot have that
//! defect. There is no second spelling to forget, and a mistyped label is a
//! value the compiler can see rather than a query that quietly matches nothing.
//! So the interesting question is not "can Rust reach parity" but "does the
//! machinery LabKit needed still have a reason to exist here". This slice is
//! the smallest honest answer.
//!
//! ## What is deliberately unfaithful, and would matter later
//!
//! **Handle minting counts nodes.** `CRIT_1` comes from counting `Criterion`
//! nodes and adding one. LabKit uses a Postgres `SEQUENCE` per entity type,
//! which never reuses a number after a delete — this does. No delete verb
//! exists in slice 1, so the two agree here and would diverge the moment one
//! did. Named rather than hidden: it is the first thing to fix if this grows.

use std::{
    env, fs,
    io::Write,
    path::PathBuf,
    process::ExitCode,
};

use grafeo::{EdgeId, GrafeoDB, NodeId, Value};

/// The one place a label's handle prefix is written.
///
/// A pair spelled in two places is the defect this port exists to avoid, so it
/// is spelled once here and derived everywhere else.
const KINDS: &[(&str, &str)] = &[
    ("Criterion", "CRIT"),
    ("Question", "Q"),
    ("LineOfEnquiry", "LOE"),
    ("Task", "TASK"),
    ("Gate", "GATE"),
    ("Artefact", "ART"),
    ("Evidence", "EV"),
    ("EvidenceUnit", "EU"),
    ("Computation", "COMP"),
    ("Claim", "CLM"),
    ("Decision", "DEC"),
    ("CriterionEvaluation", "CEVAL"),
    ("Review", "REV"),
];

fn prefix_for(label: &str) -> &'static str {
    KINDS
        .iter()
        .find(|(l, _)| *l == label)
        .map(|(_, p)| *p)
        .unwrap_or_else(|| panic!("no handle prefix for label {label}"))
}

/// Mints the next handle for a label: `CRIT_1`, `CRIT_2`, …
///
/// Counting rather than a sequence — see the module note. It reads every node,
/// which is fine at spike scale and is the second thing to fix after the
/// delete-reuse divergence.
fn next_handle(db: &GrafeoDB, label: &str) -> String {
    let used = db
        .iter_nodes()
        .filter(|n| n.labels.iter().any(|l| &**l == label))
        .count();
    format!("{}_{}", prefix_for(label), used + 1)
}

fn create(db: &GrafeoDB, label: &str, props: Vec<(&str, String)>) -> String {
    let handle = next_handle(db, label);
    let mut all: Vec<(String, Value)> = vec![("handle".into(), Value::from(handle.as_str()))];
    all.extend(props.into_iter().map(|(k, v)| (k.to_string(), Value::from(v.as_str()))));
    db.create_node_with_props(&[label], all);
    handle
}

fn by_handle(db: &GrafeoDB, handle: &str) -> Option<NodeId> {
    db.find_nodes_by_property("handle", &Value::from(handle))
        .into_iter()
        .next()
}

fn prop(db: &GrafeoDB, id: NodeId, key: &str) -> String {
    db.get_node(id)
        .and_then(|n| n.get_property(key).cloned())
        .map(|v| match v {
            Value::String(s) => s.to_string(),
            other => format!("{other:?}"),
        })
        .unwrap_or_default()
}

/// Nodes reached from `src` along one edge type, in insertion order.
///
/// The whole traversal surface this slice needs. Note what is absent: there is
/// no query string, so there is no second place to forget an edge type.
fn out(db: &GrafeoDB, src: NodeId, edge_type: &str) -> Vec<NodeId> {
    db.iter_edges()
        .filter(|e| e.src == src && &*e.edge_type == edge_type)
        .map(|e| e.dst)
        .collect()
}

/// Nodes reaching `dst` along one edge type — the same traversal backwards.
///
/// Both directions are one filter over `iter_edges`, which is the point: on
/// AGE the "in" direction is a different Cypher pattern that has to be written
/// out again, and writing it again is how a direction gets forgotten.
fn into_(db: &GrafeoDB, dst: NodeId, edge_type: &str) -> Vec<NodeId> {
    db.iter_edges()
        .filter(|e| e.dst == dst && &*e.edge_type == edge_type)
        .map(|e| e.src)
        .collect()
}

fn edge(db: &GrafeoDB, a: NodeId, b: NodeId, t: &str) {
    db.create_edge_with_props(a, b, t, [] as [(&str, &str); 0]);
}

fn nodes_labelled(db: &GrafeoDB, label: &str) -> Vec<NodeId> {
    db.iter_nodes()
        .filter(|n| n.labels.iter().any(|l| &**l == label))
        .map(|n| n.id)
        .collect()
}

fn has_label(db: &GrafeoDB, n: NodeId, label: &str) -> bool {
    db.get_node(n)
        .is_some_and(|node| node.labels.iter().any(|l| &**l == label))
}

/// Whether a line is exactly one handle (`PREFIX_123`) and nothing else —
/// what every write command's stdout is, and what no rendered report line
/// ever is on its own (they read `text  (HANDLE)`, never a bare handle).
fn looks_like_handle(s: &str) -> bool {
    match s.rfind('_') {
        Some(i) => {
            let (prefix, rest) = (&s[..i], &s[i + 1..]);
            !prefix.is_empty()
                && prefix.chars().all(|c| c.is_ascii_uppercase())
                && !rest.is_empty()
                && rest.chars().all(|c| c.is_ascii_digit())
        }
        None => false,
    }
}

/// `labkit happened` — the acts themselves, oldest first. **Deliberately not
/// what LabKit's `happened` is**, and the gap is the finding, not an
/// oversight: `iter_nodes()` preserves creation order for free (measured,
/// `examples/graph_history_probe.rs`), so *ordering* needed no new state at
/// all — every headline node already carries a `verb` property, tagged
/// centrally in `main()` rather than per command. What is missing is
/// attribution: LabKit's real `happened` exists specifically to say **who**
/// ran an act (PJ-031) — `renderHappened`'s whole reason to read the event
/// log instead of the graph — and this port has no concept of that at all,
/// not even a `--author` flag. Adding it would mean inventing attribution
/// from nothing, which is a different, larger piece of work than "derive
/// history from the graph," and the two should not be conflated.
/// One `TraceStep` (loosely — see the field notes below), appended as one
/// NDJSON line to `LABKIT_TRACE_OUT` when set. Built for labkit#119: the
/// Explorer (`fragments/trace.ts`, `scripts/serve-explorer.ts` on `main`)
/// renders a domain's growth from exactly this shape, derived fresh from
/// LabKit's real event log on every boot rather than a committed fixture —
/// this is the same idea, on this port's own record.
///
/// **Range, not traversal.** `nodes_before`/`edges_before` were counts taken
/// before this command dispatched; everything with an id in `[before, after)`
/// is what THIS command created. `NodeId`/`EdgeId` are plain sequential
/// `u64`s (`grafeo-common`'s `types/id.rs`), so this is a direct point lookup
/// per id, not a read of the store's own iteration order — which
/// `examples/graph_history_probe.rs` measured as neither creation-ordered nor
/// stable across processes. A trace built by diffing `iter_nodes()` output
/// would have inherited that exact flakiness.
///
/// **Approximated fields, named so nobody mistakes them for the real
/// thing:** `subject` is the first created handle — this port doesn't
/// distinguish "what the act was about" from "what it created" the way
/// `ResearchSession` does. `detail` is raw `argv`, not LabKit's hand-written
/// per-verb payload. `fragment` (`LABKIT_TRACE_FRAGMENT`, optional) is
/// whatever the caller names — a slice script, say — since this port has no
/// `fragments/compositions.ts` equivalent. `derived` (per-step enquiry/gate
/// state) is not computed at all yet; deferred, per the design discussion
/// with `labkit-dev-web` on #119, until a plain trace proves worth building
/// on.
///
/// **One thing this port's version gets more honestly than the TS one:**
/// `command` here is the literal `argv` this process was actually invoked
/// with — genuinely re-runnable — where `fragments/trace.ts`'s `commandOf()`
/// is explicit that its rendering is *not* a claim the string would run.
/// `argv` with `--db <path>` removed, for display only.
fn display_argv(argv: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    let mut skip_next = false;
    for a in argv {
        if skip_next {
            skip_next = false;
            continue;
        }
        if a == "--db" {
            skip_next = true;
            continue;
        }
        out.push(a.clone());
    }
    out
}

fn emit_trace(
    db: &GrafeoDB,
    path: &str,
    command: &str,
    argv: &[String],
    nodes_before: usize,
    edges_before: usize,
) {
    let nodes_after = db.graph_store().node_count();
    let edges_after = db.graph_store().edge_count();
    if nodes_after == nodes_before && edges_after == edges_before {
        return; // a read: nothing to trace
    }

    let created: Vec<serde_json::Value> = (nodes_before..nodes_after)
        .filter_map(|i| db.get_node(NodeId(i as u64)))
        .map(|n| {
            serde_json::json!({
                "handle": prop(db, n.id, "handle"),
                "label": n.labels.first().map(|l| l.to_string()).unwrap_or_default(),
            })
        })
        .collect();

    let edges: Vec<serde_json::Value> = (edges_before..edges_after)
        .filter_map(|i| db.get_edge(EdgeId(i as u64)))
        .map(|e| {
            serde_json::json!({
                "from": prop(db, e.src, "handle"),
                "label": e.edge_type.to_string(),
                "to": prop(db, e.dst, "handle"),
            })
        })
        .collect();

    let subject = created
        .first()
        .and_then(|c| c.get("handle"))
        .and_then(|h| h.as_str())
        .unwrap_or_default();

    let step = serde_json::json!({
        "operation": command,
        "subject": subject,
        "created": created,
        "edges": edges,
        "detail": { "argv": argv },
        // `--db <path>` filtered out here only -- it's this run's throwaway
        // harness detail, not part of the act. `detail.argv` keeps it, so
        // nothing is actually lost.
        "command": format!("labkit {}", display_argv(argv).join(" ")),
        "fragment": env::var("LABKIT_TRACE_FRAGMENT").ok(),
    });

    let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) else {
        eprintln!("labkit: could not open LABKIT_TRACE_OUT={path}");
        return;
    };
    let _ = writeln!(file, "{step}");
}

fn happened(db: &GrafeoDB) -> String {
    // **Sorted by NodeId, not `iter_nodes()`'s own order.** Measured
    // (`examples/graph_history_probe.rs`) rather than assumed: on a handful
    // of nodes of a few labels, `iter_nodes()` happened to come back in
    // creation order and looked like a free lunch. On a real run it came
    // back in a different, unstable order on every one of three repeats of
    // the identical command sequence — a randomised-hasher backing store,
    // not a list. `NodeId` allocation order is what's actually reliable
    // (already leaned on throughout this port, e.g. `nodes_by_label`), so
    // sorting by it is the same fix `origin`'s `BASED_ON` read and `known`'s
    // `closing_all` needed: a report is a contract between runs, and reading
    // this store's own order back unsorted is not one.
    let mut tagged: Vec<(NodeId, String)> = db
        .iter_nodes()
        .filter_map(|n| match n.get_property("verb") {
            Some(Value::String(v)) => Some((n.id, format!("{v}  {}", prop(db, n.id, "handle")))),
            _ => None,
        })
        .collect();
    tagged.sort_by_key(|(id, _)| *id);
    let acts: Vec<String> = tagged.into_iter().map(|(_, line)| line).collect();
    if acts.is_empty() {
        "Nothing matching.\n\nAn empty log is not an empty record: every other command answers from\nthe graph, and answers there are durable whether or not an act was logged.".to_string()
    } else {
        acts.join("\n")
    }
}

/// Pulls one field out of the `--concludes` JSON blob
/// (`{"proposition": "…", "finding": "…"}`) by string splitting, not parsing —
/// enough for the two keys every conclusion carries, matching the shape
/// `src/cli/args.ts`'s `conclusion()` validates on the Bun side.
fn conclusion_field(concludes: &str, key: &str) -> String {
    concludes
        .split(&format!("\"{key}\""))
        .nth(1)
        .and_then(|t| t.split('"').nth(1))
        .unwrap_or_default()
        .to_string()
}

/// The write half shared by `analyse`, `reverify` and `replace`: a
/// Computation, the EvidenceUnit that ran it, the output Artefact it
/// produced, and one Evidence + Claim for the conclusion. Mirrors LabKit's
/// private `recorded()` (`src/domain/write.ts`) — composed verbs call this
/// rather than duplicating it, the same rule that keeps `open` as `pose` +
/// `pursue` under one event.
///
/// **The output Artefact was missing until this fix (2026-08-31).** LabKit's
/// `Artefact` label covers both a raw observation and an analysis's own
/// output — `recorded()` mints one of the latter, `outputArtefactOf()` reads
/// it back, and `replaceAnalysis()` invalidates it. Slices 1-4 never print
/// its handle, so the gap was invisible: `analyse` minted one fewer Artefact
/// than Bun on every call, and nothing downstream ever named the number that
/// shifted. It surfaced only once slice 5 named a *later* Artefact by
/// handle and got a different one than Bun did.
fn record_analysis(
    db: &GrafeoDB,
    enquiry: Option<NodeId>,
    method: &str,
    from: Option<&str>,
    implementing: Option<&str>,
    held_to: Option<&str>,
    proposition: &str,
    finding: &str,
) -> (String, String, String) {
    let comp = create(db, "Computation", vec![("method", method.to_string())]);
    let eu = create(db, "EvidenceUnit", vec![]);
    let output = create(db, "Artefact", vec![
        ("name", format!("{method} output")),
        ("kind", "analysis-output".to_string()),
    ]);
    let ev = create(db, "Evidence", vec![("statement", finding.to_string())]);
    let claim = create(db, "Claim", vec![
        ("name", proposition.to_string()),
        ("kind", "exploratory".to_string()),
    ]);
    if let (Some(c), Some(u), Some(out_art), Some(e), Some(cl)) = (
        by_handle(db, &comp), by_handle(db, &eu), by_handle(db, &output),
        by_handle(db, &ev), by_handle(db, &claim),
    ) {
        if let Some(l) = enquiry {
            edge(db, u, l, "ADDRESSES");
        }
        edge(db, u, c, "USES");
        edge(db, u, e, "PRODUCES");
        edge(db, u, out_art, "PRODUCES");
        edge(db, c, out_art, "PRODUCES");
        edge(db, e, cl, "SUPPORTS");
        if let Some(a) = from.and_then(|h| by_handle(db, h)) {
            edge(db, c, a, "CONSUMES");
        }
        if let Some(t) = implementing.and_then(|h| by_handle(db, h)) {
            edge(db, c, t, "IMPLEMENTS");
        }
        // QUALIFIES at record time, not evaluate time — an edge minted at the
        // later moment cannot express a check nobody ran.
        if let Some(cr) = held_to.and_then(|h| by_handle(db, h)) {
            edge(db, cr, u, "QUALIFIES");
        }
    }
    (comp, ev, claim)
}

/// The single finding by which an analysis concluded something about one
/// proposition. Mirrors `ResearchSession.findingFor` (`src/domain/core.ts`).
fn finding_for(db: &GrafeoDB, analysis: NodeId, proposition: &str) -> Option<NodeId> {
    into_(db, analysis, "USES")
        .into_iter()
        .flat_map(|u| out(db, u, "PRODUCES"))
        .find(|&e| {
            out(db, e, "SUPPORTS")
                .into_iter()
                .chain(out(db, e, "CHALLENGES"))
                .any(|c| prop(db, c, "name") == proposition)
        })
}

// ── the commands ─────────────────────────────────────────────────────────────

/// `labkit known` — what the programme knows, in five buckets.
///
/// **Computed, never stored**, which is LabKit's rule and is why there is no
/// `Question.status` column to maintain. At slice 1 nothing has been run
/// against anything, so every question falls to `untested` — and that is the
/// bucket the fixture asserts, so a port that stored a status and defaulted it
/// to something friendlier would fail the diff.
fn known(db: &GrafeoDB) -> String {
    let (mut established, mut provisional, mut unresolved, mut untested) =
        (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let mut accepted_rows: Vec<String> = Vec::new();

    for q in nodes_labelled(db, "Question") {
        let row = format!("  - {}  ({})", prop(db, q, "asks"), prop(db, q, "handle"));

        // Has any evidence unit addressed a line of enquiry pursuing this
        // question? That is "worked on" — and it is a traversal, not a stored
        // flag, which is why observing something moves the question without
        // anything setting a status.
        let worked = into_(db, q, "PURSUES")
            .iter()
            .any(|loe| !into_(db, *loe, "ADDRESSES").is_empty());

        // Closed on a cited claim, and whether that claim was promoted. The
        // two facts are separate on purpose: promotion is its own act, so an
        // answer resting on unpromoted work is *provisional* rather than
        // established (S-18). A port that collapsed them would pass the
        // final `known` and fail the middle one.
        // **Sorted, not `.next()`.** `reinterpret` adds a second SUPPORTS edge
        // from the same evidence to the narrowed claim, so this returns two
        // claims once a reading has been narrowed — and the unsorted first was
        // whichever the store handed back. The answer rests on the claim that
        // closed it, which is the earlier one.
        let mut closing_all: Vec<NodeId> = into_(db, q, "RESOLVES")
            .into_iter()
            .flat_map(|d| out(db, d, "BASED_ON"))
            .flat_map(|ev| out(db, ev, "SUPPORTS"))
            .collect();
        closing_all.sort();
        let closing = closing_all.first().copied();

        // **Promotion alone is not enough.** A claim held to a prespecified
        // check that failed or was never run is `provisional`, not
        // `established` — a check nobody performed counts against the finding
        // it qualifies. The first version of this port had promoted+cited go
        // straight to `established`, which is the defect LabKit itself carried
        // until S-19: the survey said `established` about a claim its own
        // `why` was simultaneously calling unmet. The fixture caught it here.
        let met = |claim: NodeId| -> bool {
            into_(db, claim, "SUPPORTS")
                .iter()
                .flat_map(|ev| into_(db, *ev, "PRODUCES"))
                .flat_map(|u| into_(db, u, "QUALIFIES"))
                .all(|crit| check_state(db, crit) == "passed")
        };

        // `accepted` is its own act and its own bucket. An abandoned question
        // is still classified by whether anyone worked on it; an accepted one
        // is reached through the deciding act instead -- which is the
        // distinction S-14 exists for.
        let accepted = !into_(db, q, "ACCEPTS").is_empty();

        match closing {
            _ if accepted => accepted_rows.push(row),
            Some(claim) if prop(db, claim, "kind") == "confirmatory" && met(claim) => {
                established.push(row)
            }
            Some(_) => provisional.push(row),
            None if worked => unresolved.push(row),
            None => untested.push(row),
        }
    }
    let bucket = |title: &str, rows: &[String]| -> String {
        let body = if rows.is_empty() { "  nothing".to_string() } else { rows.join("\n") };
        format!("{title}\n{body}\n")
    };
    [
        bucket("Established", &established),
        bucket("Provisional (answered, but not something to build on yet)", &provisional),
        bucket("Accepted as unresolved", &accepted_rows),
        bucket("Unresolved (worked on, no answer yet)", &unresolved),
        bucket("Untested (nothing has been run against these)", &untested),
    ]
    .join("\n")
    .trim_end()
    .to_string()
}

/// `labkit design <gate-id>` — the full amendment chain, oldest first.
///
/// Mirrors LabKit's `amendmentChain()` + `designHistory()`
/// (`src/domain/read.ts`): every Decision that `CHANGES` a criterion this
/// gate has ever been governed by (GOVERNS is additive — `amend` never
/// retracts the old edge), ordered by walking `SUPERSEDES` forward from the
/// one decision with no older sibling. The order comes from the record
/// itself, never from a timestamp or from natural-id allocation order.
fn design(db: &GrafeoDB, g: NodeId) -> String {
    let governed = out(db, g, "GOVERNS");
    let Some(newest) = governed.iter().copied().find(|c| into_(db, *c, "CHANGES").is_empty())
    else {
        return format!("{}, unamended", prop(db, g, "handle"));
    };

    let changed_by: Vec<(NodeId, NodeId)> = governed
        .iter()
        .flat_map(|c| into_(db, *c, "CHANGES").into_iter().map(|d| (d, *c)))
        .collect();
    if changed_by.is_empty() {
        return format!("{}, unamended", prop(db, g, "handle"));
    }
    let criterion_changed_by = |d: NodeId| -> Option<NodeId> {
        changed_by.iter().find(|(dec, _)| *dec == d).map(|(_, c)| *c)
    };

    let older_of: Vec<(NodeId, Option<NodeId>)> = changed_by
        .iter()
        .map(|(d, _)| (*d, out(db, *d, "SUPERSEDES").into_iter().next()))
        .collect();
    // The root is the one step with no older sibling. Every other step is
    // reached by walking forward, so a malformed chain (a cycle, or more than
    // one root) simply stops early rather than looping -- this is a spike
    // report, not a validator.
    let Some(root) = older_of.iter().find(|(_, older)| older.is_none()).map(|(d, _)| *d) else {
        return format!("{}, unamended", prop(db, g, "handle"));
    };
    let mut ordered = vec![root];
    while let Some(next) = older_of
        .iter()
        .find(|(_, older)| *older == ordered.last().copied())
        .map(|(d, _)| *d)
    {
        ordered.push(next);
    }

    let tasks: Vec<String> = out(db, g, "GATES")
        .into_iter()
        .map(|t| format!("{} ({})", prop(db, t, "objective"), prop(db, t, "handle")))
        .collect();

    let steps: Vec<String> = ordered
        .iter()
        .enumerate()
        .map(|(i, &dec)| {
            let was = criterion_changed_by(dec);
            let now = if i + 1 < ordered.len() {
                criterion_changed_by(ordered[i + 1])
            } else {
                Some(newest)
            };
            let citing = out(db, dec, "CITING").into_iter().next();
            let cited_text = citing
                .map(|c| {
                    into_(db, c, "SUPPORTS")
                        .into_iter()
                        .next()
                        .map(|e| prop(db, e, "statement"))
                        .unwrap_or_default()
                })
                .unwrap_or_default();
            format!(
                "scientific  ({})\n  was: {}\n  now: {}\n  because: {}\n  citing: {}\n  needs re-running: {}",
                prop(db, dec, "handle"),
                was.map(|o| prop(db, o, "proposition")).unwrap_or_default(),
                now.map(|o| prop(db, o, "proposition")).unwrap_or_default(),
                prop(db, dec, "reason"),
                cited_text,
                tasks.join(", "),
            )
        })
        .collect();

    let originally = criterion_changed_by(ordered[0])
        .map(|o| prop(db, o, "proposition"))
        .unwrap_or_default();

    format!(
        "{}, on {}\n  originally: {}\n  now requires: {}\n\nAmendments\n{}\n\nOrdered from the record itself, not from timestamps.",
        prop(db, g, "handle"),
        prop(db, newest, "handle"),
        originally,
        prop(db, newest, "proposition"),
        steps.join("\n\n"),
    )
}

/// `labkit gate <id>` — itemised, and computed from the checks under it.
///
/// The state is derived, so there is no value anyone can set to `satisfied` —
/// the last line of the report says so, and it is asserted by the fixture.
/// With no evaluation recorded, every condition is `never-run` and the gate is
/// `never-evaluated`, which is a first-class state rather than the absence of
/// one.
fn gate(db: &GrafeoDB, handle: &str) -> Option<String> {
    let g = by_handle(db, handle)?;
    let criteria = out(db, g, "GOVERNS");
    let gating = out(db, g, "GATES");

    // **Computed, never stored**, which is why there is no value anyone can
    // set to `satisfied` — the report says so on its last line and the fixture
    // asserts it. `never-evaluated` is a first-class state, not the absence of
    // one: it is what a gate reads before anybody checks anything.
    let states: Vec<String> = criteria.iter().map(|c| check_state(db, *c)).collect();
    let state_word = gate_state(db, g);

    let mut sections: Vec<String> = Vec::new();

    // Padded to the longest state name (`no-standing-verdict`, 19). Pad the
    // value, never a coloured copy: an escape sequence has length and would
    // pad bytes nobody can see.
    let conditions: Vec<String> = criteria
        .iter()
        .zip(&states)
        .map(|(c, state)| {
            let mut row = format!(
                "  - {:<19} {}  ({})",
                state,
                prop(db, *c, "proposition"),
                prop(db, *c, "handle")
            );
            if let Some(e) = out(db, *c, "EVALUATED_AS").first() {
                row.push_str(&format!(
                    "  decided {} on \"{}\"",
                    if prop(db, *e, "outcome") == "fail" { "failed" } else { "passed" },
                    prop(db, *e, "value")
                ));
            }
            row
        })
        .collect();
    sections.push(format!("Conditions\n{}", conditions.join("\n")));

    // Omitted entirely when everything is met -- a section listing nothing is
    // noise, and the fixture has no empty one.
    let unmet: Vec<String> = criteria
        .iter()
        .zip(&states)
        .filter(|(_, st)| *st != "passed")
        .map(|(c, _)| format!("  - {}  ({})", prop(db, *c, "proposition"), prop(db, *c, "handle")))
        .collect();
    if !unmet.is_empty() {
        sections.push(format!("Not currently met\n{}", unmet.join("\n")));
    }

    let gated: Vec<String> = gating
        .iter()
        .map(|t| format!("  - {}  ({})", prop(db, *t, "objective"), prop(db, *t, "handle")))
        .collect();
    sections.push(format!("Gating\n{}", gated.join("\n")));

    let evals: Vec<String> = criteria
        .iter()
        .flat_map(|c| out(db, *c, "EVALUATED_AS"))
        .map(|e| {
            format!(
                "  - {}  {}  \"{}\"  ({})",
                prop(db, e, "at"),
                if prop(db, e, "outcome") == "fail" { "failed" } else { "passed" },
                prop(db, e, "value"),
                prop(db, e, "handle")
            )
        })
        .collect();
    if !evals.is_empty() {
        sections.push(format!("Evaluations\n{}", evals.join("\n")));
    }

    Some(format!(
        "{handle} — {state_word}\n  consequence: {}\n{}\nComputed, never stored. There is no value anyone can set to `satisfied`.",
        prop(db, g, "consequence"),
        sections.join("\n\n"),
    ))
}

/// `labkit why <claim>` — why a conclusion counts as supported.
///
/// The composed report, and the one that would have been hardest on AGE: it
/// reaches a claim's evidence, the standard it was held to, what that standard
/// blocks, and the artefacts underneath — four traversals that on AGE are four
/// hand-written Cypher clauses, each of which has to remember both bearings.
/// A bullet list, or one line naming what an empty one means. Mirrors
/// `src/cli/views/format.ts`'s `bullets()`.
fn bullets(items: &[String], empty: &str) -> String {
    if items.is_empty() {
        format!("  {empty}")
    } else {
        items.iter().map(|i| format!("  - {i}")).collect::<Vec<_>>().join("\n")
    }
}

/// `labkit reproduction <analysis>` — a re-run, against what its original
/// read. Mirrors `reproductionOf()` (`src/domain/read.ts`): finds what the
/// verifying analysis `REVERIFIES`, then compares `CONSUMES` on both sides.
/// Never says "reproduced" — only `agrees`/`disagrees`, because whether
/// reading the same inputs is the same execution depends on the method, which
/// the record does not know.
fn reproduction(db: &GrafeoDB, handle: &str) -> Option<String> {
    let verification = by_handle(db, handle)?;
    let new_ev = into_(db, verification, "USES")
        .into_iter()
        .flat_map(|u| out(db, u, "PRODUCES"))
        .find(|&e| !out(db, e, "REVERIFIES").is_empty())?;
    let old_ev = out(db, new_ev, "REVERIFIES").into_iter().next()?;
    let old_comp = into_(db, old_ev, "PRODUCES")
        .into_iter()
        .flat_map(|u| out(db, u, "USES"))
        .next()?;

    let read_of = |c: NodeId| -> Vec<(String, String)> {
        out(db, c, "CONSUMES")
            .into_iter()
            .map(|a| (prop(db, a, "name"), prop(db, a, "handle")))
            .collect()
    };
    let mine = read_of(verification);
    let theirs = read_of(old_comp);
    let their_handles: Vec<&str> = theirs.iter().map(|(_, h)| h.as_str()).collect();
    let my_handles: Vec<&str> = mine.iter().map(|(_, h)| h.as_str()).collect();

    // Absence on both sides is still absence, not agreement: an original with
    // no recorded provenance makes every one of the re-run's inputs
    // `unrecorded-in-the-original` rather than silently `differs: []`.
    let mut differs: Vec<(String, String)> = if theirs.is_empty() {
        mine.iter()
            .map(|(n, h)| (format!("{n}  ({h})"), "unrecorded-in-the-original".to_string()))
            .collect()
    } else {
        let mut d: Vec<(String, String)> = mine
            .iter()
            .filter(|(_, h)| !their_handles.contains(&h.as_str()))
            .map(|(n, h)| (format!("{n}  ({h})"), "changed".to_string()))
            .collect();
        d.extend(
            theirs
                .iter()
                .filter(|(_, h)| !my_handles.contains(&h.as_str()))
                .map(|(n, h)| (format!("{n}  ({h})"), "not-used-by-the-re-run".to_string())),
        );
        d
    };
    differs.sort();

    let new_challenges = !out(db, new_ev, "CHALLENGES").is_empty();
    let old_challenges = !out(db, old_ev, "CHALLENGES").is_empty();
    let agrees = new_challenges == old_challenges;

    let line = |(n, h): &(String, String)| format!("{n}  ({h})");
    let differs_block = if differs.is_empty() {
        "\nNothing differs in what the two runs read.".to_string()
    } else {
        let rows: Vec<String> =
            differs.iter().map(|(what, standing)| format!("{what} — {standing}")).collect();
        format!("\nDiffering\n{}", bullets(&rows, ""))
    };

    Some(format!(
        "{}  ({})\n  re-checking {}  ({})\n  the two runs' findings {} — this {} confidence\n\nThe re-run read\n{}\n\nThe original read\n{}\n{}\n\nThis does not say the original was reproduced. Whether reading the same\nrecords is the same execution depends on what the method does, and the\nrecord does not know that.",
        prop(db, verification, "method"),
        prop(db, verification, "handle"),
        prop(db, old_comp, "method"),
        prop(db, old_comp, "handle"),
        if agrees { "agrees" } else { "disagrees" },
        if new_challenges { "lowers" } else { "raises" },
        bullets(&mine.iter().map(line).collect::<Vec<_>>(), "nothing on the record"),
        bullets(&theirs.iter().map(line).collect::<Vec<_>>(), "nothing on the record"),
        differs_block,
    ))
}

/// `labkit reproducibility <analysis> [part=hash...]` — whether an analysis
/// can be accounted for from what it read. Mirrors `reproducibilityOf()`
/// (`src/domain/read.ts`): `CONSUMES` names what was read, and each part
/// lands in exactly one of four buckets. Unverifiable (no hash on record) is
/// the record admitting it cannot answer, not the same as answering no.
fn reproducibility(db: &GrafeoDB, handle: &str, rebuilt: &[&String]) -> Option<String> {
    let analysis = by_handle(db, handle)?;
    let offered: Vec<(&str, &str)> =
        rebuilt.iter().filter_map(|s| s.split_once('=')).collect();

    let (mut exact, mut differing, mut unverifiable, mut not_rebuilt) =
        (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    for a in out(db, analysis, "CONSUMES") {
        let a_handle = prop(db, a, "handle");
        let entry = format!("{}  ({})", prop(db, a, "name"), a_handle);
        let recorded_hash = prop(db, a, "hash");
        let candidate = offered.iter().find(|(p, _)| *p == a_handle).map(|(_, h)| *h);
        if recorded_hash.is_empty() {
            unverifiable.push(entry);
        } else if let Some(h) = candidate {
            if h == recorded_hash {
                exact.push(entry);
            } else {
                differing.push(entry);
            }
        } else {
            not_rebuilt.push(entry);
        }
    }
    for bucket in [&mut exact, &mut differing, &mut unverifiable, &mut not_rebuilt] {
        bucket.sort();
    }
    let reproducible =
        !exact.is_empty() && differing.is_empty() && unverifiable.is_empty() && not_rebuilt.is_empty();

    Some(format!(
        "{} — {}\n\nRebuilt and identical\n{}\n\nRebuilt and different\n{}\n\nUnverifiable (the record kept no hash, so nothing can be said either way)\n{}\n\nNot rebuilt\n{}",
        prop(db, analysis, "handle"),
        if reproducible { "accounted for" } else { "not accounted for" },
        bullets(&exact, "nothing"),
        bullets(&differing, "nothing"),
        bullets(&unverifiable, "nothing"),
        bullets(&not_rebuilt, "nothing"),
    ))
}

fn why(db: &GrafeoDB, handle: &str) -> Option<String> {
    let claim = by_handle(db, handle)?;
    let promoted = prop(db, claim, "kind") == "confirmatory";

    let mut resting = Vec::new();
    let mut artefacts = Vec::new();
    for ev in into_(db, claim, "SUPPORTS") {
        for unit in into_(db, ev, "PRODUCES") {
            for comp in out(db, unit, "USES") {
                resting.push(format!(
                    "  - {}  (via {}, {})",
                    prop(db, ev, "statement"),
                    prop(db, comp, "method"),
                    prop(db, comp, "handle")
                ));
                for art in out(db, comp, "CONSUMES") {
                    artefacts.push(format!(
                        "  - {}  [{}]",
                        prop(db, art, "name"),
                        prop(db, art, "handle")
                    ));
                }
            }
        }
    }

    // The standard: criteria qualifying the unit that produced the evidence.
    // Written when the analysis is recorded, not when the check is evaluated —
    // a check nobody ran must still count against the finding it qualifies.
    let mut held = Vec::new();
    let mut unmet = Vec::new();
    for ev in into_(db, claim, "SUPPORTS") {
        for unit in into_(db, ev, "PRODUCES") {
            for crit in into_(db, unit, "QUALIFIES") {
                let state = check_state(db, crit);
                held.push(format!("  - {} — {}", prop(db, crit, "proposition"), state));
                if state != "passed" {
                    let mut row = format!(
                        "  - {}  ({})",
                        prop(db, crit, "proposition"),
                        prop(db, crit, "handle")
                    );
                    // What the unmet check *blocks*. Reached backwards along
                    // GOVERNS — the direction that does not exist as a verb in
                    // LabKit today, and is one filter here.
                    for g in into_(db, crit, "GOVERNS") {
                        row.push_str(&format!(
                            "\n      blocks {} — {}",
                            prop(db, g, "handle"),
                            prop(db, g, "consequence")
                        ));
                        for t in out(db, g, "GATES") {
                            row.push_str(&format!(
                                "\n        holding up {}  ({})",
                                prop(db, t, "objective"),
                                prop(db, t, "handle")
                            ));
                        }
                    }
                    unmet.push(row);
                }
            }
        }
    }

    let supported = if promoted { "supported, confirmatory" } else { "NOT supported, exploratory" };
    let mut out_s = format!(
        "\"{}\"\n  {}\nResting on\n{}\n",
        prop(db, claim, "name"),
        supported,
        resting.join("\n")
    );
    if !held.is_empty() {
        out_s.push_str(&format!("\nHeld to\n{}\n", held.join("\n")));
    }
    if !unmet.is_empty() {
        out_s.push_str(&format!("\nNot currently met\n{}\n", unmet.join("\n")));
    }
    out_s.push_str(&format!("\nUltimately resting on\n{}", artefacts.join("\n")));
    Some(out_s)
}

/// A gate's state, computed from the checks under it — never stored.
///
/// `never-evaluated` is not the absence of a state; it is what a gate reads
/// before anybody has checked anything, and it must be distinguishable from a
/// gate whose condition failed.
fn gate_state(db: &GrafeoDB, g: NodeId) -> String {
    let states: Vec<String> = out(db, g, "GOVERNS").iter().map(|c| check_state(db, *c)).collect();
    if states.is_empty() || states.iter().all(|s| s == "never-run") {
        "never-evaluated".into()
    } else if states.iter().any(|s| s != "passed") {
        "blocked".into()
    } else {
        "satisfied".into()
    }
}

/// A check's state, computed from its evaluations.
///
/// `never-run` is a first-class value rather than the absence of one: a check
/// nobody performed must be distinguishable from one that failed.
fn check_state(db: &GrafeoDB, crit: NodeId) -> String {
    let evals = out(db, crit, "EVALUATED_AS");
    if evals.is_empty() {
        return "never-run".into();
    }
    if evals.iter().any(|e| prop(db, *e, "outcome") == "fail") {
        return "failed".into();
    }
    "passed".into()
}

// ── argument parsing ─────────────────────────────────────────────────────────

/// Reads `--name value`, hand-rolled rather than pulling in a parser.
///
/// A spike earns no dependencies it has not needed twice. This is the second
/// use, and it is nine lines.
/// An ISO-8601 stamp to the millisecond, the shape the Bun CLI emits.
///
/// Hand-rolled rather than pulling in `chrono`: the parity harness normalises
/// this field to `<timestamp>` because it differs on every run, so what has to
/// be right is the *shape*, and one dependency for one format string is not a
/// trade a spike should make.
fn now_iso() -> String {
    let d = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock before 1970");
    let (secs, ms) = (d.as_secs(), d.subsec_millis());
    let days = secs / 86_400;
    let (h, m, sec) = ((secs % 86_400) / 3600, (secs % 3600) / 60, secs % 60);
    // Civil-from-days, Howard Hinnant's algorithm.
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}T{h:02}:{m:02}:{sec:02}.{ms:03}Z")
}

fn opt(args: &[String], name: &str) -> Option<String> {
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1).cloned())
}

fn main() -> ExitCode {
    let argv: Vec<String> = env::args().skip(1).collect();

    // `--db <dir>` names the directory holding the record, exactly as the Bun
    // CLI does; the parity harness always passes one, into a temp dir it
    // removes, so a run shares nothing with a working database.
    let db_dir: PathBuf = opt(&argv, "--db")
        .map(PathBuf::from)
        .unwrap_or_else(|| env::current_dir().expect("cwd"));
    let store = db_dir.join(".labkit-grafeo");
    let fresh = !store.exists();
    if fresh {
        fs::create_dir_all(&store).expect("create record");
    }

    let db = match GrafeoDB::open(&store) {
        Ok(db) => db,
        Err(e) => {
            eprintln!("labkit: {e}");
            return ExitCode::FAILURE;
        }
    };

    let positional: Vec<String> = {
        let mut out = Vec::new();
        let mut i = 0;
        while i < argv.len() {
            if argv[i].starts_with("--") {
                i += 2; // every flag in slice 1 takes a value
            } else {
                out.push(argv[i].clone());
                i += 1;
            }
        }
        out
    };

    let Some(command) = positional.first().map(String::as_str) else {
        eprintln!("labkit: no command");
        return ExitCode::FAILURE;
    };
    let rest: Vec<&String> = positional.iter().skip(1).collect();

    // Snapshot before dispatch, for the trace this command may emit — see
    // `emit_trace` below for why a count, not a traversal.
    let (nodes_before, edges_before) = (db.graph_store().node_count(), db.graph_store().edge_count());

    let output = match command {
        "criterion" => {
            let text = rest.first().map(|s| s.to_string()).unwrap_or_default();
            Some(create(&db, "Criterion", vec![("proposition", text)]))
        }
        "open" => {
            // One act, two nodes: `open` is `pose` + `pursue`, which is why
            // `known` reports a Question the caller never named.
            let text = rest.first().map(|s| s.to_string()).unwrap_or_default();
            let q = create(&db, "Question", vec![("asks", text.clone())]);
            let loe = create(&db, "LineOfEnquiry", vec![("pursuing", text)]);
            let (qid, lid) = (by_handle(&db, &q), by_handle(&db, &loe));
            if let (Some(qid), Some(lid)) = (qid, lid) {
                db.create_edge_with_props(lid, qid, "PURSUES", [] as [(&str, &str); 0]);
            }
            Some(loe)
        }
        "plan" => Some(create(
            &db,
            "Task",
            vec![
                ("objective", opt(&argv, "--objective").unwrap_or_default()),
                ("acceptance", opt(&argv, "--acceptance").unwrap_or_default()),
                ("may_read", opt(&argv, "--may-read").unwrap_or_default()),
            ],
        )),
        "declare" => {
            let handle = create(
                &db,
                "Gate",
                vec![("consequence", opt(&argv, "--consequence").unwrap_or_default())],
            );
            let g = by_handle(&db, &handle);
            // Both edges written here, at declare time. LabKit writes
            // QUALIFIES when the analysis is recorded rather than when the
            // check is evaluated, for the same reason: an edge minted at the
            // later moment cannot express the case the scenario exists for.
            if let Some(g) = g {
                for (flag, edge) in [("--governed-by", "GOVERNS"), ("--protecting", "GATES")] {
                    if let Some(target) = opt(&argv, flag).and_then(|h| by_handle(&db, &h)) {
                        db.create_edge_with_props(g, target, edge, [] as [(&str, &str); 0]);
                    }
                }
            }
            Some(handle)
        }
        // One act, many records: an artefact, an evidence unit, and the
        // evidence itself. The caller names none of them and gets the artefact
        // back, because that is the one the next command consumes.
        "observe" => {
            let loe = rest.first().and_then(|h| by_handle(&db, h));
            let art = create(&db, "Artefact", vec![
                ("name", opt(&argv, "--name").unwrap_or_default()),
                ("hash", opt(&argv, "--hash").unwrap_or_default()),
            ]);
            let ev = create(&db, "Evidence", vec![
                ("statement", opt(&argv, "--finding").unwrap_or_default()),
            ]);
            let eu = create(&db, "EvidenceUnit", vec![]);
            if let (Some(l), Some(a), Some(e), Some(u)) =
                (loe, by_handle(&db, &art), by_handle(&db, &ev), by_handle(&db, &eu))
            {
                edge(&db, u, l, "ADDRESSES");
                edge(&db, u, e, "PRODUCES");
                edge(&db, e, a, "RECORDED_IN");
            }
            Some(art)
        }
        // Answers with the analysis first, then one claim per conclusion — the
        // order the caller gave them. Both handles, because a caller cannot
        // cite a claim it cannot name.
        "analyse" => {
            let loe = rest.first().and_then(|h| by_handle(&db, h));
            let concludes = opt(&argv, "--concludes").unwrap_or_default();
            let (from, implementing, held_to) = (
                opt(&argv, "--from"),
                opt(&argv, "--implementing"),
                opt(&argv, "--held-to"),
            );
            let (comp, _ev, claim) = record_analysis(
                &db,
                loe,
                &opt(&argv, "--method").unwrap_or_default(),
                from.as_deref(),
                implementing.as_deref(),
                held_to.as_deref(),
                &conclusion_field(&concludes, "proposition"),
                &conclusion_field(&concludes, "finding"),
            );
            Some(format!("{comp}\n{claim}"))
        }
        // Promotion is its own act. Until it happens the finding is scratch,
        // and an answer resting on it is provisional rather than established.
        "promote" => {
            let claim = rest.first().and_then(|h| by_handle(&db, h));
            let dec = create(&db, "Decision", vec![
                ("reason", opt(&argv, "--because").unwrap_or_default()),
            ]);
            if let (Some(c), Some(d)) = (claim, by_handle(&db, &dec)) {
                edge(&db, d, c, "PROMOTES");
                db.set_node_property(c, "kind", Value::from("confirmatory"));
            }
            rest.first().map(|s| s.to_string())
        }
        "close" => {
            let loe = rest.first().and_then(|h| by_handle(&db, h));
            let dec = create(&db, "Decision", vec![]);
            if let (Some(l), Some(d)) = (loe, by_handle(&db, &dec)) {
                for q in out(&db, l, "PURSUES") {
                    edge(&db, d, q, "RESOLVES");
                }
                if let Some(cl) = opt(&argv, "--answered-by").and_then(|h| by_handle(&db, &h)) {
                    for ev in into_(&db, cl, "SUPPORTS") {
                        edge(&db, d, ev, "BASED_ON");
                    }
                }
            }
            rest.first().map(|s| s.to_string())
        }
        "evaluate" => {
            let crit = rest.first().and_then(|h| by_handle(&db, h));
            let ev = create(&db, "CriterionEvaluation", vec![
                ("value", opt(&argv, "--value").unwrap_or_default()),
                ("outcome", opt(&argv, "--outcome").unwrap_or_default()),
                ("at", now_iso()),
            ]);
            if let (Some(c), Some(e)) = (crit, by_handle(&db, &ev)) {
                edge(&db, c, e, "EVALUATED_AS");
                if let Some(g) = opt(&argv, "--gate").and_then(|h| by_handle(&db, &h)) {
                    edge(&db, e, g, "TRIGGERS");
                }
            }
            rest.first().map(|s| s.to_string())
        }
        "why" => rest.first().and_then(|h| why(&db, h)),

        // ── slice 3: reads off a record the caller already has handles into ──
        //
        // Every one is a traversal and a format. None needs a query string, and
        // none repeats an edge type another already spells -- `out`/`into_` are
        // the only two ways through the graph in this program.
        "claims" => rest.first().map(|text| {
            let rows: Vec<String> = nodes_labelled(&db, "Claim")
                .into_iter()
                .filter(|c| prop(&db, *c, "name") == **text)
                .map(|c| format!("  - {}  ({})", prop(&db, c, "name"), prop(&db, c, "handle")))
                .collect();
            format!("Claims asserting \"{text}\"\n{}", rows.join("\n"))
        }),
        "pursuits" => rest.first().and_then(|h| by_handle(&db, h)).map(|q| {
            let rows: Vec<String> = into_(&db, q, "PURSUES")
                .into_iter()
                .map(|l| format!("  - {}", prop(&db, l, "handle")))
                .collect();
            format!(
                "Lines of enquiry pursuing {}\n{}\n\n`labkit enquiry <id>` says whether one is still open and what it has produced.",
                rest.first().unwrap(), rows.join("\n")
            )
        }),
        "criteria" => rest.first().and_then(|h| by_handle(&db, h)).map(|g| {
            let rows: Vec<String> = out(&db, g, "GOVERNS")
                .into_iter()
                .map(|c| format!("  - {}", prop(&db, c, "handle")))
                .collect();
            format!(
                "Conditions governing {}\n{}\n\nHandles only. `labkit gate` gives the same conditions with their wording and\ntheir current standing.",
                rest.first().unwrap(), rows.join("\n")
            )
        }),
        // A gate's state and a task's state, listed. The entry points an agent
        // needs when it holds no handle at all -- which is the whole reason
        // these two exist.
        "gates" => {
            let wanted = opt(&argv, "--state");
            let rows: Vec<String> = nodes_labelled(&db, "Gate")
                .into_iter()
                .filter_map(|g| {
                    let state = gate_state(&db, g);
                    match &wanted {
                        Some(w) if *w != state => None,
                        _ => Some(format!(
                            "{}  {}  {}",
                            state, prop(&db, g, "handle"), prop(&db, g, "consequence")
                        )),
                    }
                })
                .collect();
            Some(rows.join("\n"))
        }
        "work" => {
            let wanted = opt(&argv, "--state");
            let rows: Vec<String> = nodes_labelled(&db, "Task")
                .into_iter()
                .filter_map(|t| {
                    // `carried-out` means an analysis implements it. `blocked`
                    // needs a gate over it whose condition FAILED -- a gate
                    // merely never-evaluated does not hold work back.
                    let implemented = !into_(&db, t, "IMPLEMENTS").is_empty();
                    let held = into_(&db, t, "GATES")
                        .into_iter()
                        .any(|g| gate_state(&db, g) == "blocked");
                    let state = if held { "blocked" } else if implemented { "carried-out" } else { "planned" };
                    match &wanted {
                        Some(w) if w != state => None,
                        _ => Some(format!(
                            "{}  {}  {}",
                            state, prop(&db, t, "handle"), prop(&db, t, "objective")
                        )),
                    }
                })
                .collect();
            Some(rows.join("\n"))
        }
        // A refusal that is an answer, not a gap: only a question sharpened
        // from an earlier one has an origin, and saying so is the report.
        // **The snapshot is frozen, not recomputed.** `sharpen` records what was
        // known at that moment onto the decision; evidence that arrived later
        // is deliberately absent. That is how LabKit answers "what was known
        // then" without a time-travelling database — and it is exactly the
        // design Grafeo's epoch APIs might have made unnecessary, which is why
        // that question is recorded as an open dispute rather than settled.
        "origin" => rest.first().and_then(|h| by_handle(&db, h)).map(|q| {
            let Some(dec) = into_(&db, q, "MOTIVATES").into_iter().next() else {
                return format!(
                    "{} was posed directly.\n\nThat is an answer, not a gap: only a question sharpened from an earlier\none has an origin on the record.",
                    prop(&db, q, "handle")
                );
            };
            let from = out(&db, dec, "NARROWS").into_iter().next();
            // **Sorted, not the traversal's own order.** `iter_edges()` is
            // unordered once more than one BASED_ON edge leaves the same
            // decision — `sharpen` writes them in NodeId order, but reading
            // them back without re-sorting let the list come back reordered
            // on some runs and not others. Same defect as `known`'s
            // `closing_all.sort()`, found the same way: by running the
            // fixture, not by reading this traversal and trusting it.
            let mut based_on = out(&db, dec, "BASED_ON");
            based_on.sort();
            let frozen: Vec<String> = based_on
                .into_iter()
                .map(|e| format!("  - {}  ({})", prop(&db, e, "statement"), prop(&db, e, "handle")))
                .collect();
            format!(
                "{} narrowed \"{}\"  ({})\n  because: {}\n\nKnown at that moment\n{}\n\nFrozen when the sharpening was recorded, not recomputed now. Evidence that\narrived later is deliberately absent from this list.",
                prop(&db, q, "handle"),
                from.map(|f| prop(&db, f, "asks")).unwrap_or_default(),
                from.map(|f| prop(&db, f, "handle")).unwrap_or_default(),
                prop(&db, dec, "reason"),
                frozen.join("\n"),
            )
        }),
        "interpretation" => rest.first().and_then(|h| by_handle(&db, h)).map(|c| format!(
            "Now claims \"{}\"  ({})\n\nOriginally\n  - {}  ({})\n\nRevisions\n  none — this reading has not been narrowed",
            prop(&db, c, "name"), prop(&db, c, "handle"),
            prop(&db, c, "name"), prop(&db, c, "handle"),
        )),
        // **The caveat is the report.** Absence from these lists is not a
        // finding of independence -- it is a lower bound over the routes named,
        // and a reader who takes it for independence has been misled by a
        // correct answer. So the routes walked are printed beside the result.
        "reproduction" => rest.first().and_then(|h| reproduction(&db, h)),
        "reproducibility" => {
            let handle = rest.first();
            let extra: Vec<&String> = rest.iter().skip(1).copied().collect();
            handle.and_then(|h| reproducibility(&db, h, &extra))
        }
        "affects" => {
            let wanted_name = rest.first().map(|s| s.to_string()).unwrap_or_default();
            let Some(art) = nodes_labelled(&db, "Artefact")
                .into_iter()
                .find(|a| prop(&db, *a, "name") == wanted_name)
            else {
                eprintln!("labkit: no artefact named \"{wanted_name}\"");
                return ExitCode::FAILURE;
            };
            let mut claims = Vec::new();
            let mut loes = Vec::new();
            for comp in into_(&db, art, "CONSUMES") {
                for unit in into_(&db, comp, "USES") {
                    for ev in out(&db, unit, "PRODUCES") {
                        for cl in out(&db, ev, "SUPPORTS") {
                            claims.push(format!("  - {}  ({})", prop(&db, cl, "name"), prop(&db, cl, "handle")));
                        }
                    }
                    for l in out(&db, unit, "ADDRESSES") {
                        loes.push(format!("  - {}  ({})", prop(&db, l, "pursuing"), prop(&db, l, "handle")));
                    }
                }
            }
            claims.dedup();
            loes.dedup();
            Some(format!(
                "Claims that would be affected\n{}\n\nLines of enquiry\n{}\n\nRoutes walked\n  - evidence recorded in this artefact, and the claims it bears on\n  - computations that consumed this artefact, and the claims their findings bear on\n  - the same, for every artefact downstream of this one through CONSUMES/PRODUCES\n\nThis is a lower bound, not a finding of independence: anything\nconnected by a route not listed above is absent from these lists\nand is not thereby unaffected.",
                claims.join("\n"), loes.join("\n")
            ))
        }
        // `pose` puts a question on the record without pursuing it; `pursue`
        // opens a line against one already there. `open` is the two as one act.
        // Both halves in one report: the enquiry's own findings, and what the
        // question's answer actually rests on -- which is a subset, and the
        // difference is the point. Two findings were produced; one closes it.
        "enquiry" => rest.first().and_then(|h| by_handle(&db, h)).map(|l| {
            let units = into_(&db, l, "ADDRESSES");
            // Sorted by identity, which here is insertion order. Nothing in
            // the store guarantees traversal order, and "which finding is
            // listed first" is a contract between runs, not an accident.
            //
            // **Filtered to Evidence.** A unit behind `analyse`/`reverify`/
            // `replace` also PRODUCES its analysis's own output Artefact
            // (`record_analysis`) — the exact unwalked-pair shape CLAUDE.md
            // names for `PRODUCES: [EvidenceUnit, Artefact]`. Every other
            // PRODUCES reader in this file starts from a specific Evidence
            // and is unaffected; this is the one that scans a unit's PRODUCES
            // targets indiscriminately, so it is the one that needed the
            // guard once a second target type existed.
            let mut findings: Vec<NodeId> = units
                .iter()
                .flat_map(|u| out(&db, *u, "PRODUCES"))
                .filter(|&n| has_label(&db, n, "Evidence"))
                .collect();
            findings.sort();
            let rows: Vec<String> = findings
                .iter()
                .map(|e| format!("  - {}  ({})", prop(&db, *e, "statement"), prop(&db, *e, "handle")))
                .collect();

            let question = out(&db, l, "PURSUES").into_iter().next();
            let closing: Vec<NodeId> = question
                .map(|q| into_(&db, q, "RESOLVES"))
                .unwrap_or_default()
                .into_iter()
                .flat_map(|d| out(&db, d, "BASED_ON"))
                .collect();
            let confirmatory = closing
                .iter()
                .flat_map(|ev| out(&db, *ev, "SUPPORTS"))
                .any(|c| prop(&db, c, "kind") == "confirmatory");

            let mut head = format!(
                "{}  ({})\n  produced {} findings",
                prop(&db, l, "pursuing"), prop(&db, l, "handle"), findings.len()
            );
            if let Some(q) = question {
                head.push_str(&format!(
                    "\nPursuing \"{}\"  ({})",
                    prop(&db, q, "asks"), prop(&db, q, "handle")
                ));
                if closing.is_empty() {
                    head.push_str("\n  open");
                } else {
                    head.push_str("\n  closed — answered\n  answer: yes");
                    head.push_str(if confirmatory {
                        "\n  resting on confirmatory work"
                    } else {
                        "\n  resting on exploratory work"
                    });
                }
            }
            let rests: Vec<String> = closing
                .iter()
                .map(|e| format!("  - {}  ({})", prop(&db, *e, "statement"), prop(&db, *e, "handle")))
                .collect();
            let mut outp = format!("{head}\n\nThis enquiry's findings\n{}", rows.join("\n"));
            if !rests.is_empty() {
                outp.push_str(&format!("\n\nThe question's answer rests on\n{}", rests.join("\n")));
            }
            outp
        }),
        // **Not enforced, and the report says so.** The record states what the
        // work may read; nothing stops a computation reading elsewhere. A
        // caveat that travels with the answer rather than living in a doc.
        "contract" => rest.first().and_then(|h| by_handle(&db, h)).map(|t| format!(
            "{}  ({})\n  meeting it means: {}\n\nMay read\n  - {}\n\nNot enforced. The record states what this work may look at; nothing stops\na computation reading elsewhere.",
            prop(&db, t, "objective"), prop(&db, t, "handle"),
            prop(&db, t, "acceptance"), prop(&db, t, "may_read"),
        )),
        "review" => {
            let analysis = rest.first().and_then(|h| by_handle(&db, h));
            let rev = create(&db, "Review", vec![
                ("verdict", opt(&argv, "--verdict").unwrap_or_default()),
            ]);
            if let (Some(a), Some(r)) = (analysis, by_handle(&db, &rev)) {
                edge(&db, r, a, "REVIEWS");
            }
            Some(rev)
        }
        // Minting *and* what it acted on: the decision points back at the
        // question it narrowed, and forward at the one it produced. A verb
        // that recorded only what it acted on could not answer `origin`.
        "sharpen" => {
            let from = rest.first().and_then(|h| by_handle(&db, h));
            let q = create(&db, "Question", vec![
                ("asks", opt(&argv, "--into").unwrap_or_default()),
            ]);
            let dec = create(&db, "Decision", vec![
                ("reason", opt(&argv, "--because").unwrap_or_default()),
            ]);
            if let (Some(f), Some(nq), Some(d)) = (from, by_handle(&db, &q), by_handle(&db, &dec)) {
                edge(&db, d, f, "NARROWS");
                edge(&db, d, nq, "MOTIVATES");
                // Freeze what stands *now*. Recomputing this later would answer
                // a different question than the one the report claims to.
                let mut standing = nodes_labelled(&db, "Evidence");
                standing.sort();
                for ev in standing {
                    edge(&db, d, ev, "BASED_ON");
                }
            }
            Some(q)
        }
        "amend" => {
            let old_c = rest.first().and_then(|h| by_handle(&db, h));
            let new_c = create(&db, "Criterion", vec![
                ("proposition", opt(&argv, "--now-requires").unwrap_or_default()),
            ]);
            let dec = create(&db, "Decision", vec![
                ("reason", opt(&argv, "--because").unwrap_or_default()),
            ]);
            if let (Some(o), Some(n), Some(d)) = (old_c, by_handle(&db, &new_c), by_handle(&db, &dec)) {
                // LabKit's SUPERSEDES is Decision -> Decision, not
                // Criterion -> Criterion (src/db/domain.ts). The prior
                // decision, if any, is whichever Decision MOTIVATES the
                // criterion now being amended -- present only when that
                // criterion was itself the product of an earlier amend.
                if let Some(prior_dec) = into_(&db, o, "MOTIVATES").into_iter().next() {
                    edge(&db, d, prior_dec, "SUPERSEDES");
                }
                edge(&db, d, o, "CHANGES");
                edge(&db, d, n, "MOTIVATES");
                if let Some(c) = opt(&argv, "--citing").and_then(|h| by_handle(&db, &h)) {
                    edge(&db, d, c, "CITING");
                }
                // The gate now governs the replacement, not the original.
                for g in into_(&db, o, "GOVERNS") {
                    edge(&db, g, n, "GOVERNS");
                }
            }
            Some(dec)
        }
        // One conclusion behind the same claim as before, plus one edge:
        // `recordAnalysis` again, and REVERIFIES is the whole point — without
        // it a re-check is a second independent finding, not a re-check.
        "reverify" => {
            let historical = rest.first().and_then(|h| by_handle(&db, h));
            let concludes = opt(&argv, "--concludes").unwrap_or_default();
            let proposition = conclusion_field(&concludes, "proposition");
            let original = historical.and_then(|h| finding_for(&db, h, &proposition));
            let loe = opt(&argv, "--enquiry").and_then(|h| by_handle(&db, &h));
            let under = opt(&argv, "--under");
            let (comp, ev, claim) = record_analysis(
                &db,
                loe,
                &opt(&argv, "--method").unwrap_or_default(),
                under.as_deref(),
                None,
                None,
                &proposition,
                &conclusion_field(&concludes, "finding"),
            );
            if let (Some(restated), Some(original)) = (by_handle(&db, &ev), original) {
                edge(&db, restated, original, "REVERIFIES");
            }
            Some(format!("{comp}\n{claim}"))
        }
        // Invalidates the superseded analysis's own output and records the
        // replacement in the same call -- not a Decision, and no SUPERSEDES:
        // `invalidated = true` means "no longer a source of current
        // inference", which coincides with supersession here without being
        // it (see `src/domain/write.ts`'s own note on `replaceAnalysis`).
        "replace" => {
            let superseded = rest.first().and_then(|h| by_handle(&db, h));
            let concludes = opt(&argv, "--concludes").unwrap_or_default();
            let loe = opt(&argv, "--enquiry").and_then(|h| by_handle(&db, &h));
            let from = opt(&argv, "--from");
            let (comp, _ev, claim) = record_analysis(
                &db,
                loe,
                &opt(&argv, "--method").unwrap_or_default(),
                from.as_deref(),
                None,
                None,
                &conclusion_field(&concludes, "proposition"),
                &conclusion_field(&concludes, "finding"),
            );
            if let Some(old) = superseded {
                if let Some(old_output) = out(&db, old, "PRODUCES").into_iter().next() {
                    db.set_node_property(old_output, "invalidated", Value::from("true"));
                    if let Some(review) = opt(&argv, "--because").and_then(|h| by_handle(&db, &h)) {
                        edge(&db, old_output, review, "INVALIDATED_BY");
                    }
                }
            }
            Some(format!("{comp}\n{claim}"))
        }
        // LabKit's real `reinterpret` mints a Review too -- "the review
        // records that someone objected; the decision records that the
        // objection was acted on" (src/domain/write.ts). Missing here until
        // 2026-08-31: no fixture printed a Review handle downstream of this
        // verb, so the gap was invisible until slice 5 named one by number
        // and got a different Review than Bun did.
        "reinterpret" => {
            let from = rest.first().and_then(|h| by_handle(&db, h));
            let review = create(&db, "Review", vec![
                ("verdict", opt(&argv, "--because").unwrap_or_default()),
            ]);
            let narrowed = create(&db, "Claim", vec![
                ("name", opt(&argv, "--as").unwrap_or_default()),
                ("kind", "exploratory".to_string()),
            ]);
            let dec = create(&db, "Decision", vec![
                ("reason", opt(&argv, "--because").unwrap_or_default()),
            ]);
            if let (Some(f), Some(r), Some(n), Some(d)) = (
                from, by_handle(&db, &review), by_handle(&db, &narrowed), by_handle(&db, &dec),
            ) {
                edge(&db, r, f, "EVALUATES");
                edge(&db, d, f, "CHANGES");
                edge(&db, n, f, "NARROWS_CLAIM");
                edge(&db, d, n, "MOTIVATES");
                for ev in into_(&db, f, "SUPPORTS") {
                    edge(&db, ev, n, "SUPPORTS");
                }
            }
            Some(narrowed)
        }
        "accept" => {
            let loe = rest.first().and_then(|h| by_handle(&db, h));
            let dec = create(&db, "Decision", vec![
                ("reason", opt(&argv, "--because").unwrap_or_default()),
                ("until", opt(&argv, "--until").unwrap_or_default()),
            ]);
            if let (Some(l), Some(d)) = (loe, by_handle(&db, &dec)) {
                for q in out(&db, l, "PURSUES") {
                    edge(&db, d, q, "ACCEPTS");
                }
            }
            rest.first().map(|s| s.to_string())
        }
        // How a gate's conditions were amended: what it originally required,
        // what it requires now, and whether the change was scientific or
        // mechanical. `amend` never removes the old GOVERNS edge, so a gate
        // can be governed by more than one criterion after an amendment; the
        // one in force is whichever has no incoming CHANGES from a Decision
        // (LabKit's own designHistory() reads it the same way).
        "design" => rest.first().and_then(|h| by_handle(&db, h)).map(|g| design(&db, g)),
        // **Contradiction or dissociation?** Two claims asserting different
        // sentences about the same question agree unless their evidence bears
        // opposite ways -- so the report says which, and shows the question
        // each is asked under, because two stages of one programme can assert
        // the same sentence about different endpoints.
        "conflict" => {
            let (a, b) = (
                rest.first().and_then(|h| by_handle(&db, h)),
                rest.get(1).and_then(|h| by_handle(&db, h)),
            );
            let describe = |c: NodeId| -> String {
                let question = into_(&db, c, "SUPPORTS")
                    .into_iter()
                    .flat_map(|ev| into_(&db, ev, "PRODUCES"))
                    .flat_map(|u| out(&db, u, "ADDRESSES"))
                    .flat_map(|l| out(&db, l, "PURSUES"))
                    .next();
                let evidence = into_(&db, c, "SUPPORTS")
                    .into_iter()
                    .next()
                    .map(|e| prop(&db, e, "statement"))
                    .unwrap_or_default();
                format!(
                    "\"{}\"  ({})\n  asking \"{}\"  ({})\n  supported by: {}",
                    prop(&db, c, "name"), prop(&db, c, "handle"),
                    question.map(|q| prop(&db, q, "asks")).unwrap_or_default(),
                    question.map(|q| prop(&db, q, "handle")).unwrap_or_default(),
                    evidence,
                )
            };
            match (a, b) {
                (Some(a), Some(b)) => Some(format!(
                    "Corroboration — these agree.\n\n{}\n\n{}",
                    describe(a), describe(b)
                )),
                _ => None,
            }
        }
        "pose" => Some(create(&db, "Question", vec![
            ("asks", rest.first().map(|s| s.to_string()).unwrap_or_default()),
        ])),
        "pursue" => {
            let q = rest.first().and_then(|h| by_handle(&db, h));
            let loe = create(&db, "LineOfEnquiry", vec![
                ("pursuing", q.map(|q| prop(&db, q, "asks")).unwrap_or_default()),
                ("approach", opt(&argv, "--approach").unwrap_or_default()),
            ]);
            if let (Some(q), Some(l)) = (q, by_handle(&db, &loe)) {
                edge(&db, l, q, "PURSUES");
            }
            Some(loe)
        }
        "known" => Some(known(&db)),
        "happened" => Some(happened(&db)),
        "gate" => match rest.first() {
            Some(h) => gate(&db, h),
            None => None,
        },
        other => {
            eprintln!("labkit: unknown command `{other}`");
            return ExitCode::FAILURE;
        }
    };

    // `happened`'s ordering half, for free: every write command's whole
    // stdout is the handle(s) it minted (see the module note on this
    // convention), so tagging each of those nodes with the verb that
    // produced it needs no new sink -- it reuses `create()`'s own node and
    // `by_handle()`'s own lookup. A read command's prose never matches
    // `looks_like_handle`, so this is a no-op for every command but the 26
    // that mint something.
    if let Some(text) = &output {
        for line in text.lines() {
            if looks_like_handle(line) {
                if let Some(n) = by_handle(&db, line) {
                    db.set_node_property(n, "verb", Value::from(command));
                }
            }
        }
    }

    // Explorer-compatible trace, opt-in (labkit#119) -- off unless a caller
    // asks, so every one of the 35 parity fixtures is unaffected.
    if let Ok(path) = env::var("LABKIT_TRACE_OUT") {
        emit_trace(&db, &path, command, &argv, nodes_before, edges_before);
    }

    match output {
        Some(text) => {
            println!("{text}");
            ExitCode::SUCCESS
        }
        None => {
            eprintln!("labkit: nothing to report");
            ExitCode::FAILURE
        }
    }
}
