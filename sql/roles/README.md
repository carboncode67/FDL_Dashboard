# DB roles — lab data silo

Part of `docs/lab-data-silo-plan.md` (§3, §10a). Templates only — nothing here
is run automatically, and nothing here should ever contain a real password.

- `create_lab_role.sql.template` — provisions the one Postgres role for a
  single lab (`app_<slug>`). Run once per lab, at onboarding. Copy it, replace
  the three `{{PLACEHOLDER}}`s, run it, then discard the filled-in copy (same
  pattern as `sample_compose.yaml` → `docker-compose.yml`, except this one
  holds a password so it must **not** be saved anywhere with the real values
  filled in — pipe the substitution straight into `psql`, don't write it to
  disk).
- `create_platform_role.sql.template` — provisions the single, one-time
  `app_platform` role (BYPASSRLS, SELECT-only) used by the platform-admin
  stats views. Not per-lab.

## Usage

```bash
# Lab role (repeat per lab — e.g. slug=fdl, lab_id=1):
SLUG=fdl LAB_ID=1 PASSWORD="$(openssl rand -hex 24)" \
  envsubst '${SLUG} ${LAB_ID} ${PASSWORD}' < sql/roles/create_lab_role.sql.template \
  | PGPASSWORD=$FDL_DB_PASSWORD psql -h <host> -p <port> -U nocodb -d nocodb
# Save $PASSWORD into the target compose file's DATABASE_URL__<SLUG_UPPER> yourself —
# it is not echoed or logged by the command above.

# Platform role (one time per database instance):
PASSWORD="$(openssl rand -hex 24)" \
  envsubst '${PASSWORD}' < sql/roles/create_platform_role.sql.template \
  | PGPASSWORD=$FDL_DB_PASSWORD psql -h <host> -p <port> -U nocodb -d nocodb
```

**Use `openssl rand -hex`, not `-base64`, for the password.** A base64 password
can contain `/` and `+`, which are legal in the string itself but not
unescaped inside a `postgresql://user:password@host:port/db` connection URL —
a raw `/` gets parsed as a path separator and produces a confusing "invalid
port number in database URL" error from Prisma, not an auth failure, which
makes it non-obvious what's wrong. Hex output has no special characters at
all, so there's nothing to percent-encode. (Found the hard way while
onboarding the first non-`fdl` lab on TrueNAS dev — if you ever do need a
base64 password here, percent-encode it first: `python3 -c "import
urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$PASSWORD"`.)

Run against **local and dev only** until Phase 3 of the plan says otherwise —
production role creation is its own checklist item, done deliberately, not as
a side effect of running this template.
