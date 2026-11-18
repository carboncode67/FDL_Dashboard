# Agent chat access (phone apps now, OFE Dashboard next)

Status 2026-11-18: built for the FarmerDataLogger Swift app. Kotlin and OFE Dashboard are not built yet.
Migration `101_agent_chat_access.sql`.

## What it is

The Cartographer chat (draft points/polygons on one sampling map, a person taps Apply) used to be reachable
only from the web dashboard's floating chat (session + `canEdit`). This adds an **approved list**, so selected
people can use it from outside the web dashboard:

- `Agent_Chat_Access`: one row per person per agent kind. The person is a lab-member `User` **or** a farmer
  `Contact` (CHECK: exactly one). Lab-scoped (`lab_id`, RLS `tenant_isolation`), unique per (kind, person).
- Managed in Admin Panel → Agents → "Chat access" (`/api/admin/agent-chat-access`, admin only, the admin's
  effective lab). Candidates are the lab's non-service-account users plus its contacts. Each is flagged when
  they have no app token yet.
- **The web chat is not gated by this list.** Lab staff with `canEdit` keep the web chat as before.

The grant is **identity-based, not channel-based**: the same row will let that person chat from OFE Dashboard.

## Phone API (bearer, `lib/agent/chat-access.ts`)

All under `/api/data/agent-chat`, all allowlisted in `lib/route-scopes.ts` for restricted (QR) tokens.
`withBearerChat()` refuses service-account tokens: a service token has no person behind it, so it can't chat as
"someone".

| Route | Notes |
|---|---|
| `GET /api/data/agent-chat` | Probe. Always 200 for a valid app token: `{enabled, agents:[{kind,label,blurb,needs_map}], sampling_map_ids}`. Not approved means `enabled:false`. The app shows the chat button only when enabled, and only on maps in `sampling_map_ids`. |
| `GET /requests?sampling_map_id=` | The caller's **own** requests on that map, with drafts (no provenance). Unlike the web chat, a phone user never sees other people's prompts. |
| `POST /requests` `{sampling_map_id, prompt, agent_kind?, context?:{point_id?,polygon_id?}}` | `channel: "app"`. Attributed via `requested_by_id` (User) or `requested_by_contact_id` (Contact). Same rate limit and plain-text rules as the web. |
| `DELETE /requests/:id` | Cancel your own queued or claimed request. |
| `POST /drafts/:draftId` `{action: apply\|discard\|undo}` | Only on your own request's drafts. Same `applyDraft`/`undoDraft` as the web; `applied_by_contact_id` is set for farmers. `ofeLock` applies. |

Map rule (`chatMap()`): the map must be **sent to the person** (the same `Sampling_Map_Assignments` visibility the
phone's map list uses), on a farm in their lab, and **not OFE-owned**. An OFE-owned map returns 409, because a
draft could never be applied to it here. A map that isn't theirs gets the same 404 as one that doesn't exist.

Every route re-checks the grant. A revoke takes effect on the very next call (403), and the app hides the button
when it sees that 403 or on its next probe.

## Swift app

`Agents/AgentChatService.swift` (actor) and `Views/AgentChatView.swift` (sheet). `SamplingMapDetailView` probes on
appear; the cached result is bound to a hash of the current token, so a re-scan never inherits someone else's
access. The sparkles toolbar button appears only when the probe allows this map. The chat sheet sits at half
height with the map still interactive behind it. Drafts preview on the map as dashed purple polygons and hollow
points (`SamplingMapKitView.draftPreview`). Apply/Undo re-download the map so the applied points become real
pins.

## OFE Dashboard (planned, not built)

OFE farmers sign in to OFE, not FDB, and OFE talks to FDB only with its unrestricted service token. Plan:

1. Add `/api/data/ofe/agent-chat/...` twins behind `withOfeService()` that take the signed-in OFE user's
   email (`as_email`, like `/api/data/ofe/app-qr?email=`), resolve it lab-scoped to a User, else a Contact,
   and build a `ChatPerson`. Everything after that (`grantedChatKinds`, `chatMapIds`, `chatMap`,
   `ownRequestWhere`, `requesterOf`) is shared. Set `channel: "ofe"`; migration 101 already allows it.
2. OFE must only ever pass its **own signed-in user's** email: the service token trusts OFE's session, so this
   is the same trust boundary as app-qr.
3. Map scope: OFE's maps are mostly OFE-owned (`ofe_id` set), which FDB refuses (409). Either OFE applies drafts
   to its own copy and pushes the result through its existing sampling-map sync, or the OFE-owned 409 is relaxed
   for `channel: "ofe"`. Decide this before building the OFE UI.

## Tests

`scripts/e2e-agent-chat-bearer.sh` (50 checks, local `next dev -p 3100` with `BEARER_SCOPE_ENFORCEMENT=enforce`):
probe before and after grant, the admin grant rules, the OFE-owned 409, not-your-map 404, own-requests-only, agent
claim → draft → answer, farmer apply/undo with attribution, cancel, unassign → 404, and revoke → hidden. The web
flow (`scripts/e2e-agent-requests.sh`, 38 checks) is unchanged.
