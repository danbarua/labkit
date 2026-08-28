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
    let mut untested = Vec::new();
    for q in nodes_labelled(db, "Question") {
        untested.push(format!(
            "  - {}  ({})",
            prop(db, q, "asks"),
            prop(db, q, "handle")
        ));
    }
    let bucket = |title: &str, rows: &[String]| -> String {
        let body = if rows.is_empty() { "  nothing".to_string() } else { rows.join("\n") };
        format!("{title}\n{body}\n")
    };
    [
        bucket("Established", &[]),
        bucket("Provisional (answered, but not something to build on yet)", &[]),
        bucket("Accepted as unresolved", &[]),
        bucket("Unresolved (worked on, no answer yet)", &[]),
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

    // Padded to the longest state name (`no-standing-verdict`, 19) so the
    // columns line up. Pad the value, never a coloured copy of it: an escape
    // sequence has length and would pad bytes nobody can see.
    let conditions: Vec<String> = criteria
        .iter()
        .map(|c| {
            format!(
                "  - {:<19} {}  ({})",
                "never-run",
                prop(db, *c, "proposition"),
                prop(db, *c, "handle")
            )
        })
        .collect();
    let unmet: Vec<String> = criteria
        .iter()
        .map(|c| format!("  - {}  ({})", prop(db, *c, "proposition"), prop(db, *c, "handle")))
        .collect();
    let gated: Vec<String> = gating
        .iter()
        .map(|t| format!("  - {}  ({})", prop(db, *t, "objective"), prop(db, *t, "handle")))
        .collect();

    Some(format!(
        "{handle} — never-evaluated\n  consequence: {}\nConditions\n{}\n\nNot currently met\n{}\n\nGating\n{}\nComputed, never stored. There is no value anyone can set to `satisfied`.",
        prop(db, g, "consequence"),
        conditions.join("\n"),
        unmet.join("\n"),
        gated.join("\n"),
    ))
}

// ── argument parsing ─────────────────────────────────────────────────────────

/// Reads `--name value`, hand-rolled rather than pulling in a parser.
///
/// A spike earns no dependencies it has not needed twice. This is the second
/// use, and it is nine lines.
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
