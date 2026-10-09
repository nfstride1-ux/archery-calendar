#!/bin/bash
# Tests supabase/schema.sql (RLS, last-write-wins sync, account deletion) on a throwaway local Postgres with a Supabase auth stub.
set -e; B=$(ls -d /usr/lib/postgresql/*/bin | tail -1); D=$(mktemp -d); cd "$(dirname "$0")/.."
$B/initdb -D $D/d -U postgres -A trust >/dev/null; $B/pg_ctl -D $D/d -o "-p 55433 -k $D -c listen_addresses=''" -l $D/log start >/dev/null; sleep 1
P="psql -h $D -p 55433 -U postgres -v ON_ERROR_STOP=1 -q"
trap "$B/pg_ctl -D $D/d stop -m fast >/dev/null; rm -rf $D" EXIT
$P -f tests/supabase_stub.sql; $P -f supabase/schema.sql; $P -f supabase/schema.sql   # twice: must be re-runnable
$P -f tests/test_schema.sql
