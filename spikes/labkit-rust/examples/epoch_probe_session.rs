//! Second probe: same question as `epoch_probe`, through the path Grafeo is
//! actually built for — a session executing Cypher, with `temporal` enabled.
//!
//! `epoch_probe` showed that a bare `LpgStore::new_epoch()` call does not
//! make `get_node_at_epoch` see history for a property set through the plain
//! (non-versioned) API — because on `features = ["lpg"]` alone,
//! `set_node_property_versioned` compiles down to a plain `set_node_property`
//! (see `#[cfg(not(feature = "temporal"))]` in Grafeo's `property_ops.rs`).
//! This probe adds `temporal` and goes through `db.session().execute(...)`,
//! which is what actually drives a transaction commit and finalizes a
//! property write's `EpochId::PENDING` into a real epoch.
//!
//! ```sh
//! cargo run --example epoch_probe_session --quiet
//! ```

use grafeo::GrafeoDB;

fn main() {
    let db = GrafeoDB::new_in_memory();
    let session = db.session();

    session
        .execute("INSERT (:Probe {state: 'first'})")
        .expect("insert");
    let epoch_1 = db.store().current_epoch();

    session
        .execute("MATCH (p:Probe) SET p.state = 'second'")
        .expect("update");
    let epoch_2 = db.store().current_epoch();

    println!("epoch_1 = {epoch_1:?}, epoch_2 = {epoch_2:?}");

    let at_1 = session.execute_at_epoch("MATCH (p:Probe) RETURN p.state AS state", epoch_1);
    match at_1 {
        Ok(result) => println!("as of epoch_1 (via execute_at_epoch): {:?}", result.rows()),
        Err(e) => println!("execute_at_epoch failed: {e}"),
    }

    let now = session.execute("MATCH (p:Probe) RETURN p.state AS state").expect("read");
    println!("current: {:?}", now.rows());

    assert_ne!(epoch_1, epoch_2, "a session commit should advance the epoch");
    println!("OK: at least the session path advances the epoch on commit.");
}
