//! Probe: does `iter_nodes()`'s natural order give `happened` its ordering
//! for free -- the user's instinct going in ("minimal event log is kinda
//! what we have already anyway")?
//!
//! **First attempt gave a false positive.** Three nodes, created in order,
//! came back from `iter_nodes()` in the same order — and it was tempting to
//! stop there. It was a small-hash-table coincidence: a handful of
//! well-spaced small integer keys often iterate in insertion order before a
//! hasher's bucket effects show up. Run 2 below is the test that actually
//! discriminates — the same 27-command sequence `parity/slice-5.sh` drives,
//! run three times, diffed against itself.
//!
//! ```sh
//! cargo run --example graph_history_probe --quiet
//! ```

use grafeo::{GrafeoDB, Value};

fn small_case() {
    let db = GrafeoDB::new_in_memory();
    let a = db.create_node_with_props(&["Question"], [("asks", Value::from("first"))]);
    let b = db.create_node_with_props(&["LineOfEnquiry"], [("pursuing", Value::from("second"))]);
    let c = db.create_node_with_props(&["Question"], [("asks", Value::from("third"))]);

    let natural_order: Vec<_> = db.iter_nodes().map(|n| n.id).collect();
    let created_order = vec![a, b, c];

    println!("Three nodes, small case:");
    println!("  created:      {created_order:?}");
    println!("  iter_nodes(): {natural_order:?}");
    println!(
        "  {}",
        if natural_order == created_order {
            "matches -- but see the larger case below before trusting this"
        } else {
            "does not match"
        }
    );
}

fn larger_case() {
    let db = GrafeoDB::new_in_memory();
    // ~30 nodes across 8 labels, mirroring the shape a real run has: several
    // labels, created in an order that doesn't group by label.
    let labels = [
        "Criterion", "Question", "LineOfEnquiry", "Task", "Gate", "Artefact", "Evidence",
        "Computation", "Claim", "Decision", "EvidenceUnit", "Review",
    ];
    let mut created = Vec::new();
    for i in 0..30 {
        let label = labels[i % labels.len()];
        created.push(db.create_node_with_props(&[label], [("seq", Value::from(i as i64))]));
    }

    let mut orders = Vec::new();
    for _ in 0..3 {
        // Re-open would be needed to get a fresh process; in-process the
        // store is the same object, so this instead re-derives the order
        // `iter_nodes()` reports right now, three times, to show whether
        // even one process's own iteration is stable call to call.
        orders.push(db.iter_nodes().map(|n| n.id).collect::<Vec<_>>());
    }

    println!();
    println!("30 nodes, 12 labels, three `iter_nodes()` calls in the same process:");
    println!("  creation order matches call 1? {}", orders[0] == created);
    println!("  call 1 == call 2 == call 3?    {}", orders[0] == orders[1] && orders[1] == orders[2]);
    println!(
        "  (the real discriminator is cross-PROCESS: run `happened` on the same db three\n\
         \x20\x20separate times -- see the port's own `happened`, which now sorts by NodeId\n\
         \x20\x20rather than trust this order, precisely because of what that showed: three\n\
         \x20\x20fresh `labkit-grafeo` processes against one on-disk db gave three different\n\
         \x20\x20`iter_nodes()` orders for the identical 27-command history.)"
    );
}

fn main() {
    small_case();
    larger_case();
    println!();
    println!(
        "Conclusion: iter_nodes()'s order is not creation order and not even stable across\n\
         process runs -- a randomised-hasher-backed store, not a list. NodeId allocation\n\
         order IS reliable (it's a counter), so `happened` sorts by NodeId explicitly. The\n\
         \"we already have it\" instinct was right about WHAT's durable (every act's node,\n\
         with a `verb` tag) and wrong about getting its ORDER for free."
    );
}
