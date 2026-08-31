//! Probe: does Grafeo's epoch machinery let a caller advance an epoch and
//! read a node's state as of an earlier one, on the typed CRUD API the port
//! uses (not the Cypher/session path)?
//!
//! The public, documented surface (`GrafeoDB`, `grafeo::GraphStore`) has no
//! method that advances an epoch — that's what the spike README recorded as
//! an open dispute. This probe checks one level down: `GrafeoDB::store()`
//! returns `&Arc<LpgStore>`, and `LpgStore::new_epoch()` is `pub` but
//! `#[doc(hidden)]` — present in the source, invisible in `cargo doc`, and
//! exactly what the transaction/session path calls on every commit
//! (`sync_epoch`'s own doc comment says so). Run it and read the assertions,
//! not this comment, per this repo's own rule about claims that could be
//! tested in under two minutes.
//!
//! ```sh
//! cargo run --example epoch_probe --quiet
//! ```

use grafeo::{GrafeoDB, Value};

fn main() {
    let db = GrafeoDB::new_in_memory();

    let n = db.create_node_with_props(&["Probe"], [("state", Value::from("first"))]);
    let epoch_1 = db.store().new_epoch();

    db.set_node_property(n, "state", Value::from("second"));
    let epoch_2 = db.store().new_epoch();

    let at_1 = db.store().get_node_at_epoch(n, epoch_1).unwrap();
    let at_2 = db.store().get_node_at_epoch(n, epoch_2).unwrap();

    let state_1 = at_1.get_property("state").cloned();
    let state_2 = at_2.get_property("state").cloned();

    println!("epoch_1 = {epoch_1:?}, state = {state_1:?}");
    println!("epoch_2 = {epoch_2:?}, state = {state_2:?}");

    // The expected, demonstrated result: they're equal. Writes made through
    // the typed CRUD API (create_node_with_props, set_node_property) are not
    // versioned, so get_node_at_epoch has nothing to distinguish — advancing
    // the epoch counter is not the same as recording history. See
    // epoch_probe_session for the path that does. A future Grafeo release
    // that starts distinguishing these would be the interesting result; this
    // exits non-zero so that change gets noticed rather than read as noise.
    if state_1 == state_2 {
        println!(
            "OK (expected, negative result): the typed CRUD API is not versioned — \
             get_node_at_epoch cannot tell epoch_1 from epoch_2 here."
        );
    } else {
        eprintln!(
            "UNEXPECTED: the typed CRUD API now appears to be versioned \
             (state_1={state_1:?}, state_2={state_2:?}). This contradicts the \
             2026-08-30 measurement recorded in exo-ledger pair faae445c — \
             re-check before relying on it."
        );
        std::process::exit(1);
    }
}
