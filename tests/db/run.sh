#!/bin/sh
# Runs the migrations + security tests against a throwaway local Postgres.
# Usage: PGHOST=/tmp/pg PGPORT=5544 sh tests/db/run.sh
set -e
P="psql -U postgres -q -v ON_ERROR_STOP=1"
for t in rls_test push_test; do
  $P -c "drop database if exists gymtest" >/dev/null
  $P -c "drop role if exists anon" -c "drop role if exists authenticated" >/dev/null 2>&1 || true
  $P -c "create database gymtest" >/dev/null
  $P -d gymtest -f tests/db/stub_auth.sql >/dev/null
  for m in supabase/migrations/*.sql; do $P -d gymtest -f "$m" >/dev/null; done
  $P -d gymtest -f tests/db/$t.sql 2>&1 | grep -E "ok \(blocked\)|ERROR|PASSED"
done
