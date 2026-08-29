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

use std::{env, fs, path::PathBuf, process::ExitCode};

use grafeo::{GrafeoDB, NodeId, Value};

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
        let closing = into_(db, q, "RESOLVES")
            .into_iter()
            .flat_map(|d| out(db, d, "BASED_ON"))
            .flat_map(|ev| out(db, ev, "SUPPORTS"))
            .next();

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

        match closing {
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
        bucket("Accepted as unresolved", &[]),
        bucket("Unresolved (worked on, no answer yet)", &unresolved),
        bucket("Untested (nothing has been run against these)", &untested),
    ]
    .join("\n")
    .trim_end()
    .to_string()
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
    let gate_state = if states.iter().all(|s| s == "never-run") {
        "never-evaluated"
    } else if states.iter().any(|s| s != "passed") {
        "blocked"
    } else {
        "satisfied"
    };

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
        "{handle} — {gate_state}\n  consequence: {}\n{}\nComputed, never stored. There is no value anyone can set to `satisfied`.",
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
            let field = |k: &str| -> String {
                concludes
                    .split(&format!("\"{k}\""))
                    .nth(1)
                    .and_then(|t| t.split('"').nth(1))
                    .unwrap_or_default()
                    .to_string()
            };
            let comp = create(&db, "Computation", vec![
                ("method", opt(&argv, "--method").unwrap_or_default()),
            ]);
            let eu = create(&db, "EvidenceUnit", vec![]);
            let ev = create(&db, "Evidence", vec![("statement", field("finding"))]);
            let claim = create(&db, "Claim", vec![
                ("name", field("proposition")),
                ("kind", "exploratory".to_string()),
            ]);
            if let (Some(c), Some(u), Some(e), Some(cl)) = (
                by_handle(&db, &comp), by_handle(&db, &eu),
                by_handle(&db, &ev), by_handle(&db, &claim),
            ) {
                if let Some(l) = loe { edge(&db, u, l, "ADDRESSES"); }
                edge(&db, u, c, "USES");
                edge(&db, u, e, "PRODUCES");
                edge(&db, e, cl, "SUPPORTS");
                if let Some(a) = opt(&argv, "--from").and_then(|h| by_handle(&db, &h)) {
                    edge(&db, c, a, "CONSUMES");
                }
                if let Some(t) = opt(&argv, "--implementing").and_then(|h| by_handle(&db, &h)) {
                    edge(&db, c, t, "IMPLEMENTS");
                }
                // QUALIFIES at record time, not evaluate time — an edge minted
                // at the later moment cannot express a check nobody ran.
                if let Some(cr) = opt(&argv, "--held-to").and_then(|h| by_handle(&db, &h)) {
                    edge(&db, cr, u, "QUALIFIES");
                }
            }
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
        "known" => Some(known(&db)),
        "gate" => match rest.first() {
            Some(h) => gate(&db, h),
            None => None,
        },
        other => {
            eprintln!("labkit: unknown command `{other}`");
            return ExitCode::FAILURE;
        }
    };

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
