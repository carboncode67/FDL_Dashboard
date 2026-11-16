#!/usr/bin/env bash
# Agent requests/drafts end-to-end (Cartographer C2) against a LOCAL next dev on :3100 and the LOCAL DB.
# Needs: sampling map 6 seeded with a point labelled "Center" near its farm, and an OFE-owned map 7.
# Creates a throwaway user + Cartographer token and removes everything it made. Never point at production.
set -u
cd "/Users/twk/Desktop/Projects/OFE/Farmer Data Hub/FarmersDatabase/Dashboard-UI"
DBURL=$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')
q(){ psql "$DBURL" -Atq -c "$1" 2>/dev/null; }
S=http://localhost:3100; B=$S/api/agent; JAR=$(mktemp); PW=$(openssl rand -hex 12)
HASH=$(node -e "require('bcryptjs').hash(process.argv[1],10).then(h=>console.log(h))" "$PW")
q "insert into public.users(id,email,password,role,lab_id,name) values ('agent-e2e-user','agent-e2e@local.test','$HASH','member',1,'Agent E2E')"
CT="fdla_$(openssl rand -hex 32)"; CH=$(printf %s "$CT" | shasum -a 256 | cut -d' ' -f1)
q "insert into pgntarg2udzj1f3.\"Agent_Tokens\"(lab_id,name,agent_kind,token_hash,token_prefix,expires_at) values (1,'carto e2e','cartographer','$CH','${CT:0:13}',now()+interval '1 day')"
CENTER=$(q "select id from pgntarg2udzj1f3.\"Sampling_Points\" where sampling_map_id=6 and label='Center'")
OTHERPT=$(q "select id from pgntarg2udzj1f3.\"Sampling_Points\" where sampling_map_id=7 limit 1")
pass=0; fail=0; ok(){ if [ "$1" = "$2" ]; then pass=$((pass+1)); echo "PASS $3 ($1)"; else fail=$((fail+1)); echo "FAIL $3 — got $1, want $2: $(head -c 200 /tmp/e2e_body 2>/dev/null)"; fi; }

# session login
CSRF=$(curl -s -c $JAR $S/api/auth/csrf | python3 -c 'import sys,json;print(json.load(sys.stdin)["csrfToken"])')
curl -s -b $JAR -c $JAR -o /dev/null -X POST $S/api/auth/callback/credentials --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=agent-e2e@local.test" --data-urlencode "password=$PW"
sc(){ curl -s -b $JAR -o /tmp/e2e_body -w "%{http_code}" -H "Content-Type: application/json" "$@"; }
ok "$(sc -X POST $S/api/agent-requests -d '{"sampling_map_id":6,"prompt":"10 m square centred on Center, points at NE NW SW SE","context":{"point_id":'$CENTER'}}')" 201 "session: create request"
REQ=$(python3 -c 'import json;print(json.load(open("/tmp/e2e_body"))["id"])')
ok "$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -X POST $S/api/agent-requests -d '{"sampling_map_id":6,"prompt":"x"}')" 307 "no session → redirected to login"
ok "$(sc -X POST $S/api/agent-requests -d '{"sampling_map_id":6,"prompt":"see https://evil.example"}')" 400 "URL in prompt → 400"
# floating chat: attachable maps (own lab, editable, not OFE-owned) and the widget on every page
ok "$(sc $S/api/agent-requests/maps)" 200 "attachable maps"
ok "$(python3 -c 'import json;ids=[m["id"] for m in json.load(open("/tmp/e2e_body"))["maps"]];print(6 in ids, 7 in ids)')" "True False" "maps: map 6 listed, OFE map 7 not"
ok "$(curl -s -b $JAR $S/farms/38/maps/6 | grep -c 'aria-label="Ask an agent"')" 1 "map page renders with the chat button"
ok "$(sc -X POST $S/api/agent-requests -d '{"sampling_map_id":7,"prompt":"grid every 25 m"}')" 409 "request on OFE-owned map → 409"
ok "$(curl -s -b $JAR $S/farms | grep -c 'aria-label="Ask an agent"')" 1 "chat button on other pages"

# agent
ag(){ curl -s -o /tmp/e2e_body -w "%{http_code}" -H "Authorization: Bearer $CT" -H "Content-Type: application/json" "$@"; }
ag -X POST $B/runs -d '{"task":"e2e"}' >/dev/null; RUN=$(python3 -c 'import json;print(json.load(open("/tmp/e2e_body"))["run_id"])')
ok "$(ag $B/read/sampling_points)" 403 "read before claim → 403"
ok "$(ag -X POST $B/requests/claim -d '{"run_id":'$RUN',"wait_s":2}')" 200 "claim"
GOT=$(python3 -c 'import json;r=json.load(open("/tmp/e2e_body"))["request"];print(r and r["request_id"])'); ok "$GOT" "$REQ" "claimed our request"
ok "$(ag -X POST $B/requests/claim -d '{"run_id":'$RUN',"wait_s":0}')" 409 "second claim on same run → 409"
H="X-Agent-Run: $RUN"
ag -H "$H" "$B/read/sampling_points?limit=100" >/dev/null; ok "$(python3 -c 'import json;print(sorted({r["sampling_map_id"] for r in json.load(open("/tmp/e2e_body"))["rows"]}))')" "[6]" "bound read: only map 6 points"
ok "$(ag -H "$H" $B/read/sampling_points/$OTHERPT)" 404 "other map's point → 404"
ag -H "$H" $B/read/farms/38 >/dev/null; ok "$(python3 -c 'import json;r=json.load(open("/tmp/e2e_body"))["row"];print("interview_transcript" in r or "farm_summary" in r)')" False "farm row hides transcript/summary"
ok "$(ag -H "$H" $B/read/farms/1)" 404 "other farm → 404"
ok "$(ag -H "X-Agent-Run: 999999" $B/read/sampling_points)" 403 "forged run header → 403"
ok "$(ag -H "$H" -X POST $B/compute/geo/points_around -d '{"center":{"point_id":'$CENTER'},"pattern":"square_corners","size_m":10,"label_prefix":"Center"}')" 200 "compute points_around"
python3 -c 'import json;d=json.load(open("/tmp/e2e_body"))["result"];json.dump(d["features"],open("/tmp/e2e_fc","w"));print("  labels:",[p["label"] for p in d["points"]])'
ok "$(ag -H "$H" -X POST $B/compute/geo/points_around -d '{"center":{"point_id":'$OTHERPT'},"pattern":"cross","size_m":5}')" 404 "compute on other map's point → 404"
FC=$(cat /tmp/e2e_fc)
ok "$(ag -H "$H" -X POST $B/write/geo_drafts -d '{"run_id":'$RUN',"features":'"$FC"',"explanation":"Axis-aligned 10 m square; corners on the diagonals.","provenance":[{"tool":"points_around","pattern":"square_corners","size_m":10}]}')" 201 "write draft"
DRAFT=$(python3 -c 'import json;print(json.load(open("/tmp/e2e_body"))["id"])')
ok "$(ag -H "$H" -X POST $B/write/geo_drafts -d '{"run_id":'$RUN',"sampling_map_id":7,"features":'"$FC"'}')" 404 "draft for another map → 404"
ok "$(ag -H "$H" -X POST $B/write/geo_drafts -d '{"run_id":'$RUN',"features":{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[2.35,48.85]},"properties":{}}]}}')" 400 "draft 6000 km away → 400"
ok "$(ag -H "$H" -X POST $B/write/comments -d '{"run_id":'$RUN',"target_table":"farms","target_id":38,"body":"x"}')" 403 "cartographer can't write comments"
ok "$(ag -H "$H" -X POST $B/requests/$REQ/answer -d '{"status":"done","answer":"Added a 10 m square of 4 corner points around Center — review the draft."}')" 200 "answer"

# session: list / apply / undo / discard
sc "$S/api/agent-requests?sampling_map_id=6" >/dev/null; ok "$(python3 -c 'import json;r=[x for x in json.load(open("/tmp/e2e_body"))["requests"] if x["id"]=='$REQ'][0];print(r["status"], len(r["Drafts"]))')" "done 1" "list shows done + 1 draft"
ok "$(sc -X POST $S/api/agent-requests/drafts/$DRAFT -d '{"action":"apply"}')" 200 "apply draft"
ok "$(q "select count(*) from pgntarg2udzj1f3.\"Sampling_Points\" where agent_draft_id=$DRAFT and placement_method='agent'")" 4 "4 points inserted, tagged"
ok "$(sc -X POST $S/api/agent-requests/drafts/$DRAFT -d '{"action":"apply"}')" 409 "apply twice → 409"
ok "$(sc -X POST $S/api/agent-requests/drafts/$DRAFT -d '{"action":"undo"}')" 200 "undo"
ok "$(q "select count(*) from pgntarg2udzj1f3.\"Sampling_Points\" where agent_draft_id=$DRAFT")" 0 "undo removed exactly those"
ok "$(q "select count(*) from pgntarg2udzj1f3.\"Sampling_Points\" where sampling_map_id=6 and label='Center'")" 1 "original point untouched"

# OFE-owned map: the session route refuses new requests (above); one that predates that
# rule (seeded directly) still can't be applied — ofeLock is the second line.
REQ7=$(q "insert into pgntarg2udzj1f3.\"Agent_Requests\"(lab_id,agent_kind,requested_by_id,sampling_map_id,prompt) values (1,'cartographer','agent-e2e-user',7,'ofe test') returning id")
ag -X POST $B/runs -d '{"task":"e2e2"}' >/dev/null; RUN2=$(python3 -c 'import json;print(json.load(open("/tmp/e2e_body"))["run_id"])')
ag -X POST $B/requests/claim -d '{"run_id":'$RUN2',"wait_s":2}' >/dev/null
P7=$(q "select geometry from pgntarg2udzj1f3.\"Sampling_Points\" where id=$OTHERPT")
ag -H "X-Agent-Run: $RUN2" -X POST $B/write/geo_drafts -d '{"run_id":'$RUN2',"features":{"type":"FeatureCollection","features":[{"type":"Feature","geometry":'"$P7"',"properties":{"label":"x"}}]}}' >/dev/null; echo "  ofe draft write: $(head -c 200 /tmp/e2e_body)"; D7=$(python3 -c 'import json;print(json.load(open("/tmp/e2e_body")).get("id"))')
ok "$(sc -X POST $S/api/agent-requests/drafts/$D7 -d '{"action":"apply"}')" 409 "apply on OFE-owned map → 409 (ofeLock)"
ok "$(sc -X POST $S/api/agent-requests/drafts/$D7 -d '{"action":"discard"}')" 200 "discard"

# cleanup
q "update pgntarg2udzj1f3.\"Agent_Runs\" set status='closed' where token_id=(select id from pgntarg2udzj1f3.\"Agent_Tokens\" where name='carto e2e')"
q "delete from pgntarg2udzj1f3.\"Agent_Requests\" where id in ($REQ,$REQ7)"
q "delete from pgntarg2udzj1f3.\"Agent_Tokens\" where name='carto e2e'"
q "delete from public.users where id='agent-e2e-user'"
rm -f $JAR /tmp/e2e_body /tmp/e2e_fc
echo "== $pass passed, $fail failed"
