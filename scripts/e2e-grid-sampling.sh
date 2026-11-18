#!/usr/bin/env bash
# Random grid sampling end-to-end (Cartographer skill) against a LOCAL next dev on :3100 and the LOCAL DB.
# Needs: sampling map 6 on farm 38 with Field 1 (field 2760) and strata polygons 8 + 9 (seeded test data).
# Creates a throwaway user + Cartographer token and removes everything it made. Never point at production.
set -u
cd "/Users/twk/Desktop/Projects/OFE/Farmer Data Hub/FarmersDatabase/Dashboard-UI"
DBURL=$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')
q(){ psql "$DBURL" -Atq -c "$1" 2>/dev/null; }
S=http://localhost:3100; B=$S/api/agent; JAR=$(mktemp); PW=$(openssl rand -hex 12); BODY=$(mktemp)
HASH=$(node -e "require('bcryptjs').hash(process.argv[1],10).then(h=>console.log(h))" "$PW")
q "insert into public.users(id,email,password,role,lab_id,name) values ('grid-e2e-user','grid-e2e@local.test','$HASH','member',1,'Grid E2E')"
CT="fdla_$(openssl rand -hex 32)"; CH=$(printf %s "$CT" | shasum -a 256 | cut -d' ' -f1)
q "insert into pgntarg2udzj1f3.\"Agent_Tokens\"(lab_id,name,agent_kind,token_hash,token_prefix,expires_at) values (1,'grid e2e','cartographer','$CH','${CT:0:13}',now()+interval '1 day')"
FIELD=$(q "select id from pgntarg2udzj1f3.\"Fields\" where \"Farms_id\"=38 and geometry is not null order by id limit 1")
pass=0; fail=0; ok(){ if [ "$1" = "$2" ]; then pass=$((pass+1)); echo "PASS $3 ($1)"; else fail=$((fail+1)); echo "FAIL $3 — got $1, want $2: $(head -c 300 $BODY)"; fi; }
py(){ python3 -c "import json,sys;d=json.load(open('$BODY'));$1"; }

CSRF=$(curl -s -c $JAR $S/api/auth/csrf | python3 -c 'import sys,json;print(json.load(sys.stdin)["csrfToken"])')
curl -s -b $JAR -c $JAR -o /dev/null -X POST $S/api/auth/callback/credentials --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=grid-e2e@local.test" --data-urlencode "password=$PW"
sc(){ curl -s -b $JAR -o $BODY -w "%{http_code}" -H "Content-Type: application/json" "$@"; }
ag(){ curl -s -o $BODY -w "%{http_code}" -H "Authorization: Bearer $CT" -H "Content-Type: application/json" "$@"; }

ok "$(sc -X POST $S/api/agent-requests -d '{"sampling_map_id":6,"prompt":"random grid sample, 12 points across both zones"}')" 201 "create request"
REQ=$(py 'print(d["id"])')
ag -X POST $B/runs -d '{"task":"grid e2e"}' >/dev/null; RUN=$(py 'print(d["run_id"])')
ok "$(ag -X POST $B/requests/claim -d '{"run_id":'$RUN',"wait_s":2}')" 200 "claim"
H="X-Agent-Run: $RUN"

# compute: total across two strata polygons → one shared grid, exactly 12 points
ARGS='{"polygons":[{"polygon_id":8},{"polygon_id":9}],"total":12,"label_prefix":"GS"}'
ok "$(ag -H "$H" -X POST $B/compute/geo/random_grid_sample -d "$ARGS")" 200 "compute random_grid_sample (total)"
ok "$(py 'r=d["result"];print(r["summary"]["points"], r["summary"]["grids"], r["grids"][0]["crs"][:7])')" "12 1 EPSG:32" "12 points on one UTM grid"
ok "$(py 'r=d["result"];print("points" in r and len(r["points"])==12, r["draft_with"]["compute"][0]["tool"])')" "True random_grid_sample" "small result inline + draft_with"
DRAFT_WITH=$(py 'print(json.dumps(d["result"]["draft_with"]["compute"]))')
SEED=$(py 'print(d["result"]["summary"]["seed"])')
# same args + seed → identical points
ag -H "$H" -X POST $B/compute/geo/random_grid_sample -d "$(python3 -c "import json;a=json.loads('$ARGS');a['seed']=$SEED;print(json.dumps(a))")" >/dev/null
ok "$(py 'print(d["result"]["summary"]["seed"])')" "$SEED" "re-run with seed is reproducible (seed echoed)"

# per-acre + field reference + edge buffer; large result is summarized, not inlined
if [ -n "$FIELD" ]; then
  ok "$(ag -H "$H" -X POST $B/compute/geo/random_grid_sample -d '{"polygons":[{"field_id":'$FIELD'}],"cell_size_m":5,"edge_buffer_m":2}')" 200 "compute on a field, 5 m cells"
  ok "$(py 'r=d["result"];print(r["summary"]["points"]>40, "points" in r, len(r["sample_points"]))')" "True False 5" "large result: summary + 5 sample points only"
fi
ok "$(ag -H "$H" -X POST $B/compute/geo/random_grid_sample -d '{"polygons":[{"polygon_id":8}],"total":5,"per_acre":2}')" 400 "two sizings → 400"
OTHERPOLY=$(q "select id from pgntarg2udzj1f3.\"Sampling_Map_Polygons\" where sampling_map_id<>6 limit 1")
[ -n "$OTHERPOLY" ] && ok "$(ag -H "$H" -X POST $B/compute/geo/random_grid_sample -d '{"polygons":[{"polygon_id":'$OTHERPOLY'}],"total":5}')" 404 "other map's polygon → 404"

# draft: compute without seed refused; with draft_with accepted; grid carried
ok "$(ag -H "$H" -X POST $B/write/geo_drafts -d '{"run_id":'$RUN',"compute":[{"tool":"random_grid_sample","args":'"$ARGS"'}],"explanation":"x"}')" 400 "draft compute without seed → 400"
# a forged grid point (model-supplied features can't carry grid membership)
ok "$(ag -H "$H" -X POST $B/write/geo_drafts -d '{"run_id":'$RUN',"compute":'"$DRAFT_WITH"',"explanation":"One shared grid over both zones, 12 points."}')" 201 "write draft via compute"
DRAFT=$(py 'print(d["id"])')
ok "$(q "select jsonb_array_length(grids), jsonb_array_length(features->'features') from pgntarg2udzj1f3.\"Agent_Geometry_Drafts\" where id=$DRAFT")" "1|12" "draft stores 1 grid + 12 features"
ok "$(q "select count(*) from pgntarg2udzj1f3.\"Agent_Geometry_Drafts\" d, jsonb_array_elements(d.features->'features') f where d.id=$DRAFT and f->'properties'->>'grid'='G1' and f->'properties' ? 'col'")" 12 "every draft point carries grid G1 + cell"
ok "$(q "select provenance->0->>'tool', provenance->0->>'server_computed' from pgntarg2udzj1f3.\"Agent_Geometry_Drafts\" where id=$DRAFT")" "random_grid_sample|true" "provenance records the server-computed call"
ok "$(ag -H "$H" -X POST $B/write/geo_drafts -d '{"run_id":'$RUN',"features":{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[0,0]},"properties":{"grid":"G1","col":0,"row":0}}]},"explanation":"x"}')" 400 "hand-made far-away point still refused"
ag -H "$H" -X POST $B/requests/$REQ/answer -d '{"status":"done","answer":"12 points on one shared grid."}' >/dev/null

# apply as the person → grid row + linked points; editor page renders the grid panel; undo removes both
ok "$(sc -X POST $S/api/agent-requests/drafts/$DRAFT -d '{"action":"apply"}')" 200 "apply"
GRID=$(py 'print(d["grids"][0]["id"])')
ok "$(q "select count(*) from pgntarg2udzj1f3.\"Sampling_Points\" where agent_draft_id=$DRAFT and grid_id=$GRID and grid_col is not null and grid_row is not null")" 12 "12 points linked to the grid + cell"
ok "$(q "select crs like 'EPSG:326%', cell_size_m>0, seed is not null, params->>'algorithm', created_by_id from pgntarg2udzj1f3.\"Sampling_Grids\" where id=$GRID")" "t|t|t|fdb-random-grid-v1|grid-e2e-user" "grid record stored (CRS, size, seed, algorithm, applier)"
ok "$(curl -s -b $JAR $S/farms/38/maps/6 | grep -c 'fdb-random-grid-v1')" 1 "map page passes the grid to the editor"
ok "$(sc -X POST $S/api/agent-requests/drafts/$DRAFT -d '{"action":"undo"}')" 200 "undo"
ok "$(py 'print(d["removed_grid_ids"]=='"[$GRID]"')')" True "undo reports the grid removed"
ok "$(q "select count(*) from pgntarg2udzj1f3.\"Sampling_Grids\" where id=$GRID")" 0 "grid row gone"

# cleanup
ag -X POST $B/runs/$RUN/close -d '{"status":"completed","summary":"grid e2e"}' >/dev/null
q "delete from pgntarg2udzj1f3.\"Agent_Requests\" where requested_by_id='grid-e2e-user'"
q "delete from pgntarg2udzj1f3.\"Agent_Tokens\" where name='grid e2e'"
q "delete from public.users where id='grid-e2e-user'"
rm -f $JAR $BODY
echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
