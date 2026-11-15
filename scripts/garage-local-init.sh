#!/usr/bin/env bash
# Local-dev Garage (S3) for direct-to-storage basemap uploads —
# docs/garage-s3-upload-plan.md. Not for the lab server: production setup is
# §3 of that doc, run by hand.
#
#   ./scripts/garage-local-init.sh          # first run: writes .garage-local/garage.toml
#   docker compose --profile s3 up -d garage
#   ./scripts/garage-local-init.sh          # second run: layout, bucket, key, CORS
#
# Prints the S3_* lines to add to .env.local. Idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."

DIR=.garage-local
BUCKET=fdl-uploads
KEY_NAME=fdl-dashboard
ORIGIN=${ORIGIN:-http://localhost:3000}

if [ ! -f "$DIR/garage.toml" ]; then
  mkdir -p "$DIR/meta" "$DIR/data"
  cat > "$DIR/garage.toml" <<TOML
metadata_dir = "/var/lib/garage/meta"
data_dir     = "/var/lib/garage/data"
db_engine    = "lmdb"
replication_factor = 1
rpc_bind_addr   = "127.0.0.1:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret      = "$(openssl rand -hex 32)"

[s3_api]
s3_region     = "garage"
api_bind_addr = "[::]:3900"
root_domain   = ".s3.localhost"

[admin]
api_bind_addr = "127.0.0.1:3903"
admin_token   = "$(openssl rand -base64 32)"
TOML
  echo "Wrote $DIR/garage.toml. Now: docker compose --profile s3 up -d garage, then re-run this script."
  exit 0
fi

CID=$(docker compose ps -q garage 2>/dev/null || true)
[ -n "$CID" ] || { echo "garage isn't running: docker compose --profile s3 up -d garage" >&2; exit 1; }
g() { docker exec "$CID" /garage "$@" 2>/dev/null; }

for _ in $(seq 1 20); do g status >/dev/null && break; sleep 1; done
if g status | grep -q "NO ROLE ASSIGNED"; then
  NODE=$(g status | grep -oE '^[0-9a-f]{16}' | head -1)
  g layout assign -z dev -c 20G "$NODE" >/dev/null
  g layout apply --version 1 >/dev/null
  echo "Layout applied."
fi
g bucket info "$BUCKET" >/dev/null || g bucket create "$BUCKET" >/dev/null
INFO=$(g key info --show-secret "$KEY_NAME" || g key create "$KEY_NAME")
# Local only: --owner so this script can set CORS with the same key. On the
# lab server the app key gets read+write only (plan §3.4).
g bucket allow --read --write --owner "$BUCKET" --key "$KEY_NAME" >/dev/null

KEY_ID=$(printf '%s\n' "$INFO" | awk -F': *' '/Key ID/{print $2; exit}')
SECRET=$(printf '%s\n' "$INFO" | awk -F': *' '/Secret key/{print $2; exit}')

KEY_ID=$KEY_ID SECRET=$SECRET BUCKET=$BUCKET ORIGIN=$ORIGIN node -e '
const { S3Client, PutBucketCorsCommand, PutBucketLifecycleConfigurationCommand } = require("@aws-sdk/client-s3");
const s3 = new S3Client({ endpoint: "http://localhost:3900", region: "garage", forcePathStyle: true,
  credentials: { accessKeyId: process.env.KEY_ID, secretAccessKey: process.env.SECRET },
  requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
(async () => {
  await s3.send(new PutBucketCorsCommand({ Bucket: process.env.BUCKET, CORSConfiguration: { CORSRules: [{
    AllowedOrigins: [process.env.ORIGIN], AllowedMethods: ["PUT", "GET", "HEAD"], AllowedHeaders: ["*"],
    ExposeHeaders: ["ETag"], MaxAgeSeconds: 3600 }] } }));
  await s3.send(new PutBucketLifecycleConfigurationCommand({ Bucket: process.env.BUCKET, LifecycleConfiguration: { Rules: [{
    ID: "abort-stale-multipart", Status: "Enabled", Filter: { Prefix: "" },
    AbortIncompleteMultipartUpload: { DaysAfterInitiation: 2 } }] } }));
})().catch((e) => { console.error(e); process.exit(1); });'
echo "CORS ($ORIGIN) + lifecycle set."

cat <<ENV

Add to .env.local (npm run dev on the host). Local-only key — never reuse it elsewhere:
S3_ENDPOINT_INTERNAL=http://localhost:3900
S3_ENDPOINT_PUBLIC=http://localhost:3900
S3_BUCKET=$BUCKET
S3_ACCESS_KEY_ID=$KEY_ID
S3_SECRET_ACCESS_KEY=$SECRET
ENV
