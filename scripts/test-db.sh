#!/usr/bin/env bash
# Teste supabase/migrations sur un Postgres local jetable (aucun compte Supabase requis).
# Prérequis : binaires PostgreSQL (initdb, pg_ctl, psql). Usage : scripts/test-db.sh
set -euo pipefail
if [ "$(id -u)" = 0 ]; then echo "initdb refuse de tourner en root : lance ce script avec un utilisateur normal." >&2; exit 1; fi
cd "$(dirname "$0")/.."
PGBIN="${PGBIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
DIR="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
trap '"$PGBIN/pg_ctl" -D "$DIR/data" stop -m fast >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
"$PGBIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
"$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
PSQL=("$PGBIN/psql" -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f supabase/tests/auth_stub.sql
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f supabase/tests/rls_test.sql
