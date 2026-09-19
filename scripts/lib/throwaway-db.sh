# Refuses to run when `LABKIT_DB_URL` is set.
#
# `connectDb` reads that variable before it looks at anything else and connects
# to the Postgres it names, so `--db` is silently void — a script that made a
# `mktemp -d` and passed it writes into the named database instead, and its
# `trap rm -rf` then deletes an empty directory. The first symptom is a check
# failing for a reason that is not its subject.
#
# Sourced only by scripts whose database is a throwaway. A probe that builds a
# real record may want the variable, and is left alone.
refuse_db_url() {
  if [ -n "${LABKIT_DB_URL:-}" ]; then
    printf '\nFAILED: LABKIT_DB_URL is set (%s)\n' "$LABKIT_DB_URL" >&2
    printf '  %s writes to a throwaway record and passes --db to say so,\n' "${1:-this script}" >&2
    printf '  but LABKIT_DB_URL overrides --db, so the writes would land in that\n' >&2
    printf '  database and the throwaway would be deleted empty.\n' >&2
    printf '  Run it with `env -u LABKIT_DB_URL ...`, or unset the variable.\n' >&2
    exit 1
  fi
}
