#!/bin/sh
# Runs the migration + security tests against a throwaway local Postgres.
# Usage: PGHOST=/tmp/pg PGPORT=5544 sh tests/db/run.sh
set -e
P="psql -U postgres -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists gymtest" >/dev/null
$P -c "drop role if exists anon" -c "drop role if exists authenticated" >/dev/null 2>&1 || true
$P -c "create database gymtest" >/dev/null
$P -d gymtest -f tests/db/stub_auth.sql >/dev/null
$P -d gymtest -f supabase/migrations/20261123000000_init.sql >/dev/null
$P -d gymtest -f tests/db/rls_test.sql 2>&1 | grep -E "ok \(blocked\)|ERROR|PASSED"
