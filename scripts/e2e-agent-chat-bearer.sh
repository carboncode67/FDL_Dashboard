#!/usr/bin/env bash
# Agent chat from the phone apps (migration 101, docs/agent-chat-access.md) end-to-end
# against a LOCAL next dev on :3100 (start it with BEARER_SCOPE_ENFORCEMENT=enforce) and the LOCAL DB.
# Needs: sampling map 6 (farm 38) with a point labelled "Center", and OFE-owned map 7.
# Creates a throwaway admin, a farmer Contact + a lab-member User with app tokens, a
# Cartographer token and map assignments, and removes everything it made. Never point at production.
set -u
cd "/Users/twk/Desktop/Projects/OFE/Farmer Data Hub/FarmersDatabase/Dashboard-UI"
DBURL=$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')
q(){ psql "$DBURL" -Atq -c "$1" 2>/dev/null; }
S=http://localhost:3100; B=$S/api/agent; C=$S/api/data/agent-chat
JAR=$(mktemp); BODY=$(mktemp); FCF=$(mktemp); PW=$(openssl rand -hex 12)
HASH=$(node -e "require('bcryptjs').hash(process.argv[1],10).then(h=>console.log(h))" "$PW")
FT=$(openssl rand -hex 32); UT=$(openssl rand -hex 32); ST=$(openssl rand -hex 32)
q "insert into public.users(id,email,password,role,lab_id,name) values ('chat-e2e-admin','chat-e2e-admin@local.test','$HASH','admin',1,'Chat E2E Admin')"
q "insert into public.users(id,email,password,role,lab_id,name,bearer_token) values ('chat-e2e-member','chat-e2e-member@local.test','!','member',1,'Chat E2E Member','$UT')"
q "insert into public.users(id,email,password,role,lab_id,name,bearer_token,is_service_account) values ('chat-e2e-svc','chat-e2e-svc@local.test','!','member',1,'Chat E2E Svc','$ST',true)"
CONTACT=$(q "insert into pgntarg2udzj1f3.\"Contacts\"(name,token,lab_id,farms_id) values ('Chat E2E Farmer','$FT',1,38) returning id")
q "insert into pgntarg2udzj1f3.\"Sampling_Map_Assignments\"(sampling_map_id,contact_id) values (6,$CONTACT),(7,$CONTACT)"
q "insert into pgntarg2udzj1f3.\"Sampling_Map_Assignments\"(sampling_map_id,user_id) values (6,'chat-e2e-member')"
CT="fdla_$(openssl rand -hex 32)"; CH=$(printf %s "$CT" | shasum -a 256 | cut -d' ' -f1)
q "insert into pgntarg2udzj1f3.\"Agent_Tokens\"(lab_id,name,agent_kind,token_hash,token_prefix,expires_at) values (1,'chat e2e','cartographer','$CH','${CT:0:13}',now()+interval '1 day')"
CENTER=$(q "select id from pgntarg2udzj1f3.\"Sampling_Points\" where sampling_map_id=6 and label='Center'")
pass=0; fail=0; ok(){ if [ "$1" = "$2" ]; then pass=$((pass+1)); echo "PASS $3 ($1)"; else fail=$((fail+1)); echo "FAIL $3 — got $1, want $2: $(head -c 200 $BODY)"; fi; }
j(){ python3 -c "import json,sys;d=json.load(open('$BODY'));print($1)"; }
fm(){ curl -s -o $BODY -w "%{http_code}" -H "Authorization: Bearer $FT" -H "Content-Type: application/json" "$@"; }
lm(){ curl -s -o $BODY -w "%{http_code}" -H "Authorization: Bearer $UT" -H "Content-Type: application/json" "$@"; }
ag(){ curl -s -o $BODY -w "%{http_code}" -H "Authorization: Bearer $CT" -H "Content-Type: application/json" "$@"; }

# ── not approved yet ──
ok "$(fm $C)" 200 "probe before grant"
ok "$(j 'd["enabled"], d["sampling_map_ids"]')" "False []" "probe: not enabled, no maps"
ok "$(fm -X POST $C/requests -d '{"sampling_map_id":6,"prompt":"grid every 25 m"}')" 403 "request before grant → 403"
ok "$(curl -s -o $BODY -w '%{http_code}' $C)" 401 "no token → 401"
ok "$(curl -s -o $BODY -w '%{http_code}' -H "Authorization: Bearer $ST" $C)" 403 "service-account token → 403"

# ── admin grants (session) ──
CSRF=$(curl -s -c $JAR $S/api/auth/csrf | python3 -c 'import sys,json;print(json.load(sys.stdin)["csrfToken"])')
curl -s -b $JAR -c $JAR -o /dev/null -X POST $S/api/auth/callback/credentials --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=chat-e2e-admin@local.test" --data-urlencode "password=$PW"
ad(){ curl -s -b $JAR -o $BODY -w "%{http_code}" -H "Content-Type: application/json" "$@"; }
ok "$(ad $S/api/admin/agent-chat-access)" 200 "admin: list"
ok "$(j '[p["has_app_token"] for p in d["people"] if p["type"]=="contact" and p["id"]=="'$CONTACT'"]')" "[True]" "admin: farmer listed as a candidate with a token"
ok "$(j 'any(p["id"]=="chat-e2e-svc" for p in d["people"])')" False "admin: service accounts aren't candidates"
ok "$(ad -X POST $S/api/admin/agent-chat-access -d '{"agent_kind":"sleuth","contact_id":'$CONTACT'}')" 400 "admin: grant a non-chat kind → 400"
ok "$(ad -X POST $S/api/admin/agent-chat-access -d '{"contact_id":'$CONTACT',"user_id":"chat-e2e-member"}')" 400 "admin: both user and contact → 400"
ok "$(ad -X POST $S/api/admin/agent-chat-access -d '{"user_id":"chat-e2e-svc"}')" 404 "admin: grant a service account → 404"
ok "$(ad -X POST $S/api/admin/agent-chat-access -d '{"contact_id":'$CONTACT'}')" 201 "admin: grant farmer"
GRANT=$(j 'd["id"]')
ok "$(ad -X POST $S/api/admin/agent-chat-access -d '{"contact_id":'$CONTACT'}')" 200 "admin: grant again is idempotent"
ok "$(ad -X POST $S/api/admin/agent-chat-access -d '{"user_id":"chat-e2e-member"}')" 201 "admin: grant lab member"
ok "$(curl -s -o $BODY -w '%{http_code}' -H "Authorization: Bearer $UT" $S/api/admin/agent-chat-access)" 307 "admin route with an app token → login redirect"

# ── farmer: probe + requests ──
ok "$(fm $C)" 200 "probe after grant"
ok "$(j 'd["enabled"], [a["kind"] for a in d["agents"]], d["sampling_map_ids"]')" "True ['cartographer'] [6]" "probe: enabled, map 6 only (OFE map 7 left out)"
ok "$(fm -X POST $C/requests -d '{"sampling_map_id":7,"prompt":"grid every 25 m"}')" 409 "request on OFE-owned map → 409"
ok "$(fm -X POST $C/requests -d '{"sampling_map_id":1,"prompt":"grid every 25 m"}')" 404 "request on a map not sent to you → 404"
ok "$(fm -X POST $C/requests -d '{"sampling_map_id":6,"prompt":"see https://evil.example"}')" 400 "URL in prompt → 400"
ok "$(fm -X POST $C/requests -d '{"sampling_map_id":6,"agent_kind":"sleuth","prompt":"x"}')" 403 "non-chat agent kind → 403"
ok "$(fm -X POST $C/requests -d '{"sampling_map_id":6,"prompt":"10 m square centred on Center, points at NE NW SW SE","context":{"point_id":'$CENTER'}}')" 201 "farmer: create request"
REQ=$(j 'd["id"]')
ok "$(q "select channel, requested_by_id is null, requested_by_contact_id from pgntarg2udzj1f3.\"Agent_Requests\" where id=$REQ")" "app|t|$CONTACT" "request row: channel app, attributed to the contact"
ok "$(lm "$C/requests?sampling_map_id=6")" 200 "member: list on the same map"
ok "$(j "any(r['id']==$REQ for r in d['requests'])")" False "member doesn't see the farmer's request"
ok "$(curl -s -o $BODY -w '%{http_code}' -H "Authorization: Bearer $FT" $S/api/data/farms)" 403 "farmer token still can't reach service routes"

# ── agent claims, drafts, answers ──
ag -X POST $B/runs -d '{"task":"chat e2e"}' >/dev/null; RUN=$(j 'd["run_id"]')
ok "$(ag -X POST $B/requests/claim -d '{"run_id":'$RUN',"wait_s":2}')" 200 "agent: claim"
ok "$(j 'd["request"] and (d["request"]["request_id"], d["request"]["channel"])')" "($REQ, 'app')" "agent: claimed the app request"
H="X-Agent-Run: $RUN"
ag -H "$H" -X POST $B/compute/geo/points_around -d '{"center":{"point_id":'$CENTER'},"pattern":"square_corners","size_m":10,"label_prefix":"Center"}' >/dev/null
python3 -c "import json;json.dump(json.load(open('$BODY'))['result']['features'],open('$FCF','w'))"
ok "$(ag -H "$H" -X POST $B/write/geo_drafts -d '{"run_id":'$RUN',"features":'"$(cat $FCF)"',"explanation":"10 m square."}')" 201 "agent: write draft"
DRAFT=$(j 'd["id"]')
ok "$(ag -H "$H" -X POST $B/requests/$REQ/answer -d '{"status":"done","answer":"Drafted a 10 m square around Center."}')" 200 "agent: answer"

# ── farmer: list / apply / undo ──
ok "$(fm "$C/requests?sampling_map_id=6")" 200 "farmer: list"
ok "$(j "[(r['status'], len(r['drafts']), 'provenance' in r['drafts'][0]) for r in d['requests'] if r['id']==$REQ]")" "[('done', 1, False)]" "farmer: done with 1 draft, no provenance"
ok "$(lm -X POST $C/drafts/$DRAFT -d '{"action":"apply"}')" 404 "member can't apply the farmer's draft"
ok "$(fm -X POST $C/drafts/$DRAFT -d '{"action":"bogus"}')" 400 "bad action → 400"
ok "$(fm -X POST $C/drafts/$DRAFT -d '{"action":"apply"}')" 200 "farmer: apply"
ok "$(q "select count(*) from pgntarg2udzj1f3.\"Sampling_Points\" where agent_draft_id=$DRAFT and placement_method='agent'")" 4 "4 points inserted"
ok "$(q "select status, applied_by_id is null, applied_by_contact_id from pgntarg2udzj1f3.\"Agent_Geometry_Drafts\" where id=$DRAFT")" "applied|t|$CONTACT" "draft attributed to the contact"
ok "$(fm -X POST $C/drafts/$DRAFT -d '{"action":"apply"}')" 409 "apply twice → 409"
ok "$(fm -X POST $C/drafts/$DRAFT -d '{"action":"undo"}')" 200 "farmer: undo"
ok "$(q "select count(*) from pgntarg2udzj1f3.\"Sampling_Points\" where agent_draft_id=$DRAFT")" 0 "undo removed exactly those"

# ── cancel ──
fm -X POST $C/requests -d '{"sampling_map_id":6,"prompt":"a grid every 30 m"}' >/dev/null; REQ2=$(j 'd["id"]')
ok "$(lm -X DELETE $C/requests/$REQ2)" 404 "member can't cancel the farmer's request"
ok "$(fm -X DELETE $C/requests/$REQ2)" 200 "farmer: cancel own"
ok "$(fm -X DELETE $C/requests/$REQ2)" 409 "cancel twice → 409"

# ── map unassigned → gone; revoke → hidden ──
q "delete from pgntarg2udzj1f3.\"Sampling_Map_Assignments\" where sampling_map_id=6 and contact_id=$CONTACT"
ok "$(fm "$C/requests?sampling_map_id=6")" 404 "map no longer sent to the farmer → 404"
q "insert into pgntarg2udzj1f3.\"Sampling_Map_Assignments\"(sampling_map_id,contact_id) values (6,$CONTACT)"
ok "$(ad -X DELETE $S/api/admin/agent-chat-access/$GRANT)" 200 "admin: revoke farmer"
ok "$(fm $C)" 200 "probe after revoke"
ok "$(j 'd["enabled"]')" False "probe: disabled again"
ok "$(fm "$C/requests?sampling_map_id=6")" 403 "list after revoke → 403"
ok "$(lm $C)" 200 "member probe"
ok "$(j 'd["enabled"], d["sampling_map_ids"]')" "True [6]" "member still enabled (revoke was per person)"

# cleanup
q "update pgntarg2udzj1f3.\"Agent_Runs\" set status='closed' where token_id=(select id from pgntarg2udzj1f3.\"Agent_Tokens\" where name='chat e2e')"
q "delete from pgntarg2udzj1f3.\"Agent_Requests\" where requested_by_contact_id=$CONTACT or requested_by_id='chat-e2e-member'"
q "delete from pgntarg2udzj1f3.\"Agent_Tokens\" where name='chat e2e'"
q "delete from pgntarg2udzj1f3.\"Sampling_Map_Assignments\" where contact_id=$CONTACT or user_id='chat-e2e-member'"
q "delete from pgntarg2udzj1f3.\"Agent_Chat_Access\" where contact_id=$CONTACT or user_id='chat-e2e-member'"
q "delete from pgntarg2udzj1f3.\"Contacts\" where id=$CONTACT"
q "delete from public.users where id in ('chat-e2e-admin','chat-e2e-member','chat-e2e-svc')"
rm -f $JAR $BODY $FCF
echo "== $pass passed, $fail failed"
