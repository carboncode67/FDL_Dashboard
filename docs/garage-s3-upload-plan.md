# Garage S3 storage + direct-to-storage uploads — scoping

> Status (2026-11-11): **Phase 1 + 1b built, tested locally (including in a real
> browser), not committed, not deployed.**
> See the build log (§12). Phase 0 (server setup, §3) is the user's to run on the
> lab server. Claude doesn't run it. OFE (§6) is deferred. Supersedes "option B"
> in `raster-tiling-plan.md`'s 2026-09-15 log.
>
> Decided 2026-11-04: data on a ZFS dataset under tank, metadata on NVMe (§3.1
> paths), hostname `s3.farmersdatalab.org`, existing basemaps stay `local`,
> 20 GB cap, OFE later.

## 1. Why

Large uploads (drone orthos, 1–6 GB) keep failing on the way into the
Dashboard:

- **6.3 GB on TrueNAS (2026-09-15):** `ECONNRESET` partway through, even after
  `maxDuration` went from 300 s to 3600 s. Root cause never found.
- **~3 GB on production (2026-11-03):** "Empty file received", with nothing in
  the app logs.
- **Campus network:** it blocks direct access to the lab server, so every
  transfer goes over Pangolin (internet → DO droplet → newt → lab server),
  and the intake-share workaround is just as hard to feed.
- **Memory:** the app's `proxy.ts` makes Next.js hold **the whole request
  body in memory** (`next/dist/server/body-streams.js`, `getCloneableBody`)
  before the route handler runs. So the careful busboy streaming in
  `lib/farm-uploads.ts` doesn't stop a 3 GB upload from sitting in the
  container's RAM.

Garage won't get around the campus network: it still sits behind Pangolin.
What fixes the failures is **S3 multipart upload**:
- The browser sends the file in parts of about 16–64 MB, several at a time,
  straight to storage.
- A failed part is retried on its own, and an interrupted upload can resume.
- No request runs for minutes, and no request body goes through Next.js.

## 2. Target architecture

```
Browser (FDL or OFE)                         Lab server (128.84.17.33)
  │ 1. initiate / sign parts / complete  ──►  Dashboard app :3000  ──► Garage :3900 (S3 API, localhost)
  │      (small JSON, session or bearer)        │ creates Basemaps row, triggers tiling
  │ 2. PUT parts (presigned)  ──► https://s3.farmersdatalab.org ─(Pangolin)─► Garage :3900
                                                │
Datamachine (128.84.17.58) ◄── presigned GET on the *internal* endpoint http://128.84.17.33:3900
  (PipelineProcessor tiling)      (campus LAN, no tunnel hop)
```

- **Garage** v2.x (`dxflrs/garage:v2.5.0` or newer): one node,
  `replication_factor = 1`. ZFS already protects the data underneath, so
  there's no need for Garage-level redundancy.
- **One private bucket, `fdl-uploads`.** Object keys are namespaced:
  `basemap-sources/lab-<lab_id>/farm-<farm_id>/<uuid>_<sanitized name>`.
- **Two endpoints, two presigners.** A SigV4 presigned URL signs the `Host`,
  so a URL signed for one endpoint doesn't work on the other.
  - Public `https://s3.farmersdatalab.org`: browser part uploads.
  - Internal `http://128.84.17.33:3900` (or the Docker network name, for the
    app container): server-side calls, and the processor's download URL.
    - This also removes a hairpin that exists today. The processor currently
      fetches `NEXTAUTH_URL/api/files/basemap-sources/...`, which goes out
      through the DO droplet and back into campus.
- **Tiles don't change.** The tiled pyramid stays on local disk under
  `DATA_DIR/basemap-tiles/` and is served by the existing tile route. Only
  the *source* upload moves to S3.
- **Feature flag.** When the `S3_*` env vars aren't set, the app falls back
  to today's busboy upload (same convention as `processingConfigured`). That
  keeps local dev and TrueNAS working until they get their own Garage.

## 3. Server setup (Phase 0, about half a day, run by the user)

Run Garage as its own compose project in `~/compose/garage/`, separate from
`~/compose/fdl`. It can then restart and upgrade on its own, and
`docker compose up -d --no-deps app` for FDL never touches it.

### 3.1 Storage

```bash
# data: ZFS tank (17 TB) — big objects, large recordsize
sudo zfs create -o recordsize=1M -o compression=off tank/garage-data   # or a dir under /mnt/tank/backups/
# metadata: NVMe, small + latency-sensitive
sudo mkdir -p /srv/apps/garage/meta
```
Compression is off because GeoTIFFs are usually compressed already. Turn it
on if most uploads turn out to be uncompressed TIFFs. Check where the dataset
mounts and adjust the paths below to match.

### 3.2 `~/compose/garage/garage.toml`

```toml
metadata_dir = "/var/lib/garage/meta"
data_dir     = "/var/lib/garage/data"
db_engine    = "lmdb"
metadata_auto_snapshot_interval = "6h"   # cheap insurance against lmdb corruption on a hard crash

replication_factor = 1

rpc_bind_addr   = "127.0.0.1:3901"       # single node: RPC never leaves the box
rpc_public_addr = "127.0.0.1:3901"
rpc_secret      = "<openssl rand -hex 32>"

[s3_api]
s3_region     = "garage"
api_bind_addr = "[::]:3900"
root_domain   = ".s3.farmersdatalab.org" # vhost-style unused; we force path-style

# No [s3_web] section — static website serving stays off.

[admin]
api_bind_addr = "127.0.0.1:3903"         # never exposed
admin_token   = "<openssl rand -base64 32>"
metrics_token = "<openssl rand -base64 32>"
```

### 3.3 `~/compose/garage/docker-compose.yml`

```yaml
services:
  garage:
    image: dxflrs/garage:v2.5.0
    restart: always
    network_mode: host        # :3900 on the host for newt + Datamachine; 3901/3903 bound to 127.0.0.1 in the toml
    volumes:
      - ./garage.toml:/etc/garage.toml:ro
      - /srv/apps/garage/meta:/var/lib/garage/meta
      - /mnt/tank/garage-data:/var/lib/garage/data
```
`network_mode: host` is the simplest choice. The FDL app container then
reaches Garage at `http://host.docker.internal:3900` (add
`extra_hosts: ["host.docker.internal:host-gateway"]` to the `app` service) or
at `http://128.84.17.33:3900`.

### 3.4 Initialise

```bash
cd ~/compose/garage && sudo docker compose up -d
alias garage='sudo docker exec -it $(sudo docker compose -f ~/compose/garage/docker-compose.yml ps -q garage) /garage'
garage status                                   # note the node id
garage layout assign -z lab -c 10T <node_id>    # capacity is a weight + cap; pick what tank can spare
garage layout apply --version 1
garage bucket create fdl-uploads
garage key create fdl-dashboard                 # prints Key ID + Secret — goes into FDL's compose env
garage bucket allow --read --write fdl-uploads --key fdl-dashboard   # no --owner: the app can't change bucket config
```

### 3.5 CORS + lifecycle (one-off, with any S3 client)

The browser needs CORS for cross-origin `PUT`s, and has to be able to read
the `ETag` header to complete the upload. Lifecycle rules clean up
abandoned uploads.

`cors.json`:

```json
{ "CORSRules": [{
    "AllowedOrigins": ["https://fdl.farmersdatalab.org", "https://<ofe-dashboard-domain>"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600 }] }
```

`lifecycle.json`:

```json
{ "Rules": [{ "ID": "abort-stale-multipart", "Status": "Enabled",
    "Filter": { "Prefix": "" },
    "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 2 } }] }
```

```bash
docker run --rm --network host -v $PWD:/w -w /w \
  -e AWS_ACCESS_KEY_ID=<owner-key> -e AWS_SECRET_ACCESS_KEY=<secret> -e AWS_DEFAULT_REGION=garage \
  amazon/aws-cli --endpoint-url http://127.0.0.1:3900 s3api put-bucket-cors --bucket fdl-uploads --cors-configuration file://cors.json
# same for put-bucket-lifecycle-configuration --lifecycle-configuration file://lifecycle.json
```
`PutBucketCors` and `PutBucketLifecycleConfiguration` both need a key with
`--owner` on the bucket. Use a temporary admin key (`garage key create
fdl-admin` + `bucket allow --owner`), then delete it. Garage's lifecycle
support covers only `AbortIncompleteMultipartUpload` and `Expiration`,
which is all this plan needs.

### 3.6 Pangolin resource

- New HTTP resource `s3.farmersdatalab.org`, pointing at `localhost:3900` on
  the lab server's newt site.
- **Check that the `Host` header passes through unchanged.** Presigned URLs
  are signed for `s3.farmersdatalab.org`, and Garage checks the signature
  against the `Host` it receives. A proxy that rewrites it to `localhost:3900`
  makes every part fail with 403 `SignatureDoesNotMatch`. Traefik's
  `passHostHeader` defaults to true. Confirm Pangolin doesn't set a custom
  host header on the resource.
- **Turn Pangolin SSO/auth off for this resource.** S3 clients can't do a
  browser SSO redirect. The presigned signature is the access control, and
  Garage rejects anything unsigned on a private bucket.
- **Check the Traefik timeouts on the droplet (open risk).** Traefik v3's
  entrypoint `readTimeout` defaults to **60 s**. A part that takes longer than
  that to send on a slow uplink would be cut off. Raise
  `entryPoints.websecure.transport.respondingTimeouts.readTimeout` in
  `/opt/pangolin/config/traefik/traefik_config.yml`, or keep parts small
  (§4.3). The same default may explain production's existing large-upload
  failures. Unverified.

### 3.7 Datamachine → Garage

Check that Datamachine can reach the internal endpoint:
`curl -sI http://128.84.17.33:3900` from Datamachine (a 403/400 XML reply is
fine). If ufw blocks it, allow `128.84.17.58 → :3900` only. Don't open
`:3900` to the wider campus.

### 3.8 FDL app env (`~/compose/fdl/docker-compose.yml`, `app` service)

```
S3_ENDPOINT_INTERNAL=http://host.docker.internal:3900   # app's own calls (create/complete/head)
S3_ENDPOINT_PROCESSOR=http://128.84.17.33:3900          # host the processor's presigned GET is signed for
S3_ENDPOINT_PUBLIC=https://s3.farmersdatalab.org        # host browser part URLs are signed for
S3_REGION=garage
S3_BUCKET=fdl-uploads
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```
Also document these in `.env.example`, `sample_compose.yaml` and
`CLAUDE.md`.

## 4. Dashboard-UI changes (Phase 1, about 1.5–2 days)

### 4.1 Migration `093_s3_uploads.sql`

- New table `S3_Uploads`. It tracks an upload from initiation until it
  completes or is aborted, and is what binds a presigned key to a farm and a
  user:

  ```
  id, farm_id → Farms, uploaded_by_id → users, kind ('basemap' for now),
  s3_key, upload_id (S3 multipart id), original_filename, bytes,
  part_size, status (uploading|completed|aborted), form_fields JSONB
  (display_name, crs_override_epsg, keep_document, drone_flight_record_id),
  created_at, updated_at
  ```

  **It needs the child-table `tenant_isolation` RLS policy via `farm_id` in
  the same migration.** Migration 074/075 went wrong by leaving this out:
  `Basemaps` shipped without RLS.
- `Basemaps`:
  - Add `source_storage text NOT NULL DEFAULT 'local'` (`'local' | 's3'`) and
    `source_s3_key text`.
  - Make `sha256` nullable. Nobody reads the bytes server-side any more, so
    the processor computes the hash during download and returns it in the
    webhook (§5).
- Run on local dev right away. The user runs it on production
  (`no-prod-db-migrations`).

### 4.2 `lib/s3.ts`

`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, with
`forcePathStyle: true`. Three clients, one per endpoint: `internal` for API
calls, `public` and `processor` used only for presigning. Export
`s3Configured`.

### 4.3 Routes

Session versions live under `app/api/uploads/s3/`. The bearer versions for
OFE live under `app/api/data/farms/[id]/uploads/s3/` (service token,
`withServiceFarm()`). Both call one implementation in `lib/s3-uploads.ts`,
the same pattern as `lib/farm-uploads.ts`.

| Route | Does |
|---|---|
| `POST …/initiate` `{farm_id, filename, size, kind, …fields}` | `canCreate` + farm visible under RLS. Checks the extension against `BASEMAP_EXTS` and the size against a cap (e.g. 20 GB). Calls `CreateMultipartUpload` and inserts `S3_Uploads`. Returns `{id, partSize, partCount}`. |
| `POST …/[id]/sign` `{partNumbers: [...]}` | Same user + `status = uploading`. Returns presigned `UploadPart` URLs (public endpoint, 1 h expiry, **`ContentLength` signed**, so a part can't be bigger than declared and the size cap holds). Batched, up to about 50 per call. |
| `GET …/[id]/parts` | `ListParts`, used to resume after a reload or network drop. |
| `POST …/[id]/complete` `{parts: [{PartNumber, ETag}]}` | `CompleteMultipartUpload`, then `HeadObject` to check `ContentLength == bytes`. Creates the `Basemaps` row (`source_storage = 's3'`, `tiling_status = 'pending'`) and triggers tiling (§4.5). Returns the same JSON `receiveBasemapUpload()` returns today. |
| `DELETE …/[id]` | `AbortMultipartUpload`, then `status = aborted`. |

- **Part size:** `max(16 MB, ceil(size / 9000))`, which stays well under S3's
  10,000-part limit. 16 MB rather than 64 MB because of the Traefik
  `readTimeout` (§3.6). 3 GB at 16 MB is about 190 parts.
- **Exempt from `proxy.ts` body handling?** No need. These routes only ever
  get small JSON bodies.

### 4.4 Client (`components/farm-data-upload.tsx`)

- When `s3Configured` (passed down as a prop) and the file is a GeoTIFF over
  about 50 MB, use a new `lib/s3-multipart-client.ts` instead of
  `post("/api/basemaps", fd)`. It's about 150 lines with no dependency.
  - Uploads parts with 4 running at once, using `fetch(url, {method: "PUT",
    body: file.slice(a, b)})`. `File.slice` is lazy, so the whole file is
    never read into memory.
  - Retries each part up to 5 times with backoff.
  - Shows a real progress bar (bytes in finished parts, plus XHR
    `upload.onprogress` for parts in flight).
  - Resume: saves `{s3UploadId, name, size, lastModified}` in localStorage.
    On re-drop of the same file it calls `GET …/parts` and skips finished
    parts.
  - Cancel button → `DELETE`.
- Uppy (`@uppy/aws-s3`) is the off-the-shelf alternative, but it's a heavy
  dependency for one upload box. Hand-rolled is enough here.
- The browser must not navigate away mid-upload. Use a `beforeunload`
  warning while one is in flight.

### 4.5 Tiling trigger + retile + source download

- In `triggerBasemapTiling()` calls (upload completion and `retileBasemap()`),
  for `source_storage = 's3'` rows: set `download_url` to a presigned
  `GetObject` signed for **`S3_ENDPOINT_PROCESSOR`**, with a 24 h expiry
  (long enough for a queued job). Retile signs a fresh one every time.
- `GET /api/files/basemap-sources/[filename]`: for an S3-backed row, 302 to
  a short-lived public-endpoint presigned GET.
- **`keep_document=1`:** the hard-link trick doesn't work across storage
  backends. Phase 1 hides the checkbox for S3 uploads. Later, `Documents`
  could get a `storage`/`s3_key` too, and since Garage stores blocks by
  content, a `CopyObject` wouldn't duplicate data.

## 5. PipelineProcessor change (about 1 hour)

- `fdl_client.download_file()` always sends `Authorization: Bearer …`. A
  presigned URL already carries its auth in the query string, and S3 rejects
  a request that uses two auth mechanisms at once. **Skip the header when
  the URL has `X-Amz-Signature`.**
- Compute sha256 while streaming the download. Return it as `source_sha256`
  in the basemap webhook payload, and have the webhook fill `Basemaps.sha256`
  when it's null.
- Optional: log the download throughput, to confirm the LAN path is in use.

## 6. OFE Dashboard (Phase 2, about half a day)

- Its upload box (`src/components/farm-data-upload.tsx`) uses the same client
  library. Its `src/app/api/farms/[id]/uploads/s3/...` routes are ordinary
  small-JSON proxies: `farmForFdlWrite()` authorises, then the request is
  forwarded to FDL's `/api/data/farms/[fdl_farm_id]/uploads/s3/...`. The part
  URLs FDL returns point at `s3.farmersdatalab.org`, so the bytes go
  **straight from the farmer's browser to Garage**. They never pass through
  either Next app.
- Add OFE's origin to the bucket CORS (§3.5).
- After this, `proxyClientMaxBodySize` (4 GB) can come down in both apps.

## 7. Security notes

Per `fdh-security-posture`, these lean toward over-flagging:

- **Private bucket, no anonymous access, no `[s3_web]`.** RPC and admin are
  bound to 127.0.0.1. Only `:3900` is reachable, through Pangolin, plus a
  LAN rule for Datamachine.
- **The app key has no `--owner`,** so a leaked app key can't rewrite CORS
  or lifecycle rules or delete the bucket. It can still read and write every
  object, so treat it like `PROCESSING_API_KEY`.
- **All authorisation happens before signing.** Every presigned URL is for
  one key and one upload id. Signing `ContentLength` stops part sizes being
  changed. Expiries: 1 h for parts, 24 h for the processor GET, about 5 min
  for user downloads.
- **Lab isolation:** relies on `S3_Uploads` RLS plus the lab id in each
  object key. Nothing lists the bucket on a user's behalf.
- **A presigned GET is a bearer credential while it's valid.** Never log the
  full URL, including in processor logs.
- **Abandoned uploads:** the lifecycle rule aborts them after 2 days. A
  scheduler task in `scheduler.ts` marks matching `S3_Uploads` rows aborted.
- **Backups:** `replication_factor = 1` means ZFS snapshots of
  `tank/garage-data` plus Garage's metadata snapshots are the only copies.
  Add both to whatever snapshot schedule already covers
  `/mnt/tank/backups/fdl_dashboard`.

## 8. Dev / staging

- **Local:** add a `garage` service to `sample_compose.yaml` (single-node,
  `--single-node --default-bucket`, v2.3+) with
  `S3_ENDPOINT_PUBLIC=http://localhost:3900`.
- **TrueNAS (`fdl.casata.org`):** its own Garage container and bucket, never
  the production one. Optional: until it has one, the feature flag keeps it
  on busboy uploads.
- Follow the usual rule: prove it on dev with a real multi-GB ortho before
  production gets it.

## 9. Effort + phases

| Phase | What | Estimate |
|---|---|---|
| 0 | Garage on lab server, Pangolin resource, CORS/lifecycle, Traefik timeout, Datamachine reachability (user runs) | ½ day |
| 1 | Migration 093, `lib/s3.ts`, routes, multipart client, tiling/retile/file-route changes | 1½–2 days |
| 1b | PipelineProcessor header + sha256 change, `deploy.sh` | ~1 h |
| 2 | OFE twins + client | ½ day |
| 3 (later) | Documents, phone uploads, OFEDashBot media, pipeline outputs onto S3; retire the intake share | separate scoping |

About **3 days** to end-to-end basemap uploads from FDL and OFE.

## 10. Open decisions

1. **Where on ZFS the data goes:** a new `tank/garage-data` dataset (cleaner
   snapshot and quota control) or a directory under `/mnt/tank/backups/`.
2. **Public hostname:** `s3.farmersdatalab.org`, or something less obviously
   S3.
3. **Migrate existing local basemap sources** into the bucket, or leave them
   `local`. Leaving them is the recommendation: both storage modes work.
4. **Size cap per upload** (20 GB suggested).
5. **Is OFE in Phase 2,** or FDL-only first?
6. **Traefik `readTimeout`:** raise it on the droplet or rely on 16 MB parts.
   It needs checking either way.

## 11. Sources

- Garage quick start, v2.5.0 image, toml keys, CLI:
  <https://garagehq.deuxfleurs.fr/documentation/quick-start/>
- S3 compatibility (CORS, presigned URLs, multipart all implemented;
  lifecycle limited to `AbortIncompleteMultipartUpload` + `Expiration`):
  <https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility>

## 12. Build log

**2026-11-04: Phases 1 + 1b built and tested locally. Nothing committed or deployed.**

- **Built:**
  - Migration `093_s3_uploads.sql`: `S3_Uploads` with the RLS policy, plus
    `Basemaps.source_storage`/`source_s3_key`, `sha256` nullable, and a CHECK
    constraint. Applied to **local dev only**. Production still needs it,
    run by the user.
  - Libraries: `lib/s3.ts`, `lib/s3-uploads.ts`, `lib/s3-upload-route.ts`,
    `lib/basemap-source.ts`, `lib/s3-multipart-client.ts`.
  - Routes: `app/api/s3-uploads/{route.ts,[id]/route.ts,[id]/sign,[id]/parts,[id]/complete}`.
  - Upload box: progress bar, Cancel, resume and a leave-page warning in
    `components/farm-data-upload.tsx`, enabled from the farm page via
    `directUpload={s3Configured}`.
  - Other app changes: the files-route 302 for S3 sources, `source_sha256` in
    the basemap webhook, `retileBasemap()` using `basemapSourceDownloadUrl()`,
    and the hourly stale-upload sweep.
  - Local dev: the `garage` compose profile and `scripts/garage-local-init.sh`.
  - PipelineProcessor: `download_file()` skips the bearer header for presigned
    URLs and returns sha256, and `_do_tile_basemap()` sends `source_sha256`.
- **Tested against a real Garage v2.5.0** (local container) **and the local dev
  DB.** Each item below was observed:
  - A presigned part URL signs `content-length` and carries no checksum
    params. A wrong-size PUT gets 403, and a URL used on a different host
    gets 403.
  - CORS preflight passes and `ETag` is exposed. `PutBucketCors` and the
    lifecycle `AbortIncompleteMultipartUpload` rule are both accepted.
  - The library flow works end to end:
    - initiate validation: wrong extension 400, 0 bytes 400, 21 GB 413,
      farm out of scope 404
    - another user's upload id → 404, out-of-range part → 400
    - upload parts 1 and 3, then a resume listing that shows exactly 1 and 3
    - an early complete gets 409 naming part 2, and the status is released
    - complete gets 200, and a repeat complete returns the same basemap
    - the `Basemaps` row is correct: `s3`, key, `sha256` NULL, display
      name, EPSG
    - the processor's presigned GET returns byte-identical content
    - abort, after which signing gets 409
  - Presigned GET supports Range (206). `NoSuchUpload` after abort is handled
    as "expired".
  - Garage also accepted a presigned GET that carried an extra bearer header.
    So the processor change prevents the FDL token leaking to the bucket; it
    wasn't needed to make downloads work.
- **Not yet tested:**
  - The browser client (`lib/s3-multipart-client.ts`) and upload-box UI in a
    real browser.
  - A real multi-GB file.
  - The Pangolin/Traefik path (Host passthrough, `readTimeout`).
  - Datamachine → `:3900` reachability.
  - The PipelineProcessor change on Datamachine. It compiles, but hasn't been
    deployed.
- **Next:** test the browser flow locally (`npm run dev` with the
  local-Garage env), then TrueNAS dev or production Phase 0 per §3. Order for
  production:
  1. Garage plus the Pangolin resource
  2. Migration 093
  3. Deploy the PipelineProcessor change with `deploy.sh`
  4. Add the `S3_*` env vars to the `app` service and pull the new image

**2026-11-11: browser flow tested locally (headless Chromium via Puppeteer,
`next dev` on :3001, local Garage v2.5.0, uploads throttled to 4–8 MB/s).**

- Full upload through the real upload box (70 MB, 5 parts, 4 at once): the
  progress bar moved, the success message showed, and the basemap was listed
  under the map as "waiting: no processing machine configured". The stored
  object's sha256 matched the source file.
- Cancel mid-upload: "Upload cancelled", `DELETE` called, row `aborted`.
- Resume after a reload (130 MB, 9 parts; reloaded once the first 4 were in):
  re-dropping the file reused the same `S3_Uploads` row via `GET …/parts`,
  showed "Resumed — 65 MB of 130 MB (49%)", sent only the 5 missing parts,
  and cleared the localStorage key. The stored object's sha256 matched.
- `GET /api/files/basemap-sources/<name>` for an S3 source: 302 to a 5-min
  public presigned URL (`Content-Disposition` set, bytes identical). No
  session gets a 401.
- Seen, not fixed: if a page dies right after `complete` succeeds, the
  localStorage key survives. Re-dropping the file then starts a fresh upload,
  so the basemap is duplicated (no data loss).
- Gap: for a raster, "No, just save to Documents" still uses the busboy
  POST, so a multi-GB ortho on that path can still fail (Phase 3, Documents
  on S3).
- **Still untested:** a real multi-GB file, the Pangolin/Traefik path,
  Datamachine → `:3900`, and the PipelineProcessor change on Datamachine.
  These need Phase 0 on a server.
