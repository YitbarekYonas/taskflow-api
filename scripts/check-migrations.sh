#!/usr/bin/env bash
# Proves that (1) every migration applies cleanly to an EMPTY database, and
# (2) schema.prisma matches what those migrations produce (no forgotten migration).
set -euo pipefail

CONTAINER="${DB_CONTAINER:-taskflow-db}"
SCRATCH="taskflow_migration_check"
URL="postgresql://postgres:postgres@localhost:5432/${SCRATCH}"

sql() { docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c "$1" > /dev/null; }
cleanup() { sql "DROP DATABASE IF EXISTS ${SCRATCH} WITH (FORCE);" || true; }
trap cleanup EXIT

cleanup
sql "CREATE DATABASE ${SCRATCH};"

echo "1/2  Applying every migration to an empty database..."
DATABASE_URL="$URL" npx prisma migrate deploy

echo "2/2  Checking that schema.prisma matches the migrations..."
DATABASE_URL="$URL" npx prisma migrate diff \
  --exit-code \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  || { echo "FAIL: schema.prisma and the migrations disagree. Did you forget to create a migration?"; exit 1; }

echo "OK: migrations apply cleanly and match the schema."