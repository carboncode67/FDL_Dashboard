#!/bin/bash
# Run this script FROM THE TRUENAS SHELL or any machine on the 10.0.1.x network
# It dumps the Postgres DB and prints the DATA_DIR path of the running FDL container
#
# Usage: NOCODB_DB_PASSWORD=<password> ./truenas-dump.sh

set -e

DB_HOST="10.0.1.10"
DB_PORT="5432"
DB_USER="nocodb"
DB_PASS="${NOCODB_DB_PASSWORD:?Set NOCODB_DB_PASSWORD, e.g. NOCODB_DB_PASSWORD=... ./truenas-dump.sh}"
DB_NAME="nocodb"
DUMP_OUT="/tmp/nocodb_dump.pgdump"

echo "=== Finding FDL container DATA_DIR ==="
# Try to find the running FDL app container and extract DATA_DIR
docker ps --format "{{.Names}}" | while read name; do
  val=$(docker inspect --format '{{range .Config.Env}}{{.}}\n{{end}}' "$name" 2>/dev/null | grep '^DATA_DIR=' || true)
  if [ -n "$val" ]; then
    echo "Container: $name"
    echo "  $val"
    # Also show the host path it maps to
    docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/upload-data"}}Host path: {{.Source}}{{end}}{{end}}' "$name" 2>/dev/null
    echo ""
  fi
done

echo "=== Dumping database to ${DUMP_OUT} ==="
PGPASSWORD="${DB_PASS}" pg_dump \
  -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
  --no-owner --no-acl \
  --format=custom \
  -f "${DUMP_OUT}"

echo "Dump complete: ${DUMP_OUT}"
ls -lh "${DUMP_OUT}"

echo ""
echo "=== Next: copy this dump to the lab server ==="
echo "Run from a machine that can reach both:"
echo "  scp root@${DB_HOST}:${DUMP_OUT} root@128.84.17.33:/srv/apps/fdl/nocodb_dump.pgdump"
echo ""
echo "Or from TrueNAS shell directly:"
echo "  scp ${DUMP_OUT} root@128.84.17.33:/srv/apps/fdl/nocodb_dump.pgdump"
