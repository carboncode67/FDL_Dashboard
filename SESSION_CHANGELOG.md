# Session Changelog: Experiment Assignment, Messaging Channels, and Onboarding

This documents everything changed in this session, across `FDL_Dashboard` and `OFEDashBot_integration`. Schema changes were applied locally with `prisma db push` rather than a numbered migration file, this document is the record of what changed and why until a proper migration is written.

## 1. Experiment assignment with farmer-facing nicknames

**Problem:** WhatsApp/SMS message receipts always showed "Experiment: Unknown" because nothing linked a `Contact` to a `FarmExperiment`, and the bot's `fdl_resolve_token` lookup had nowhere to read `experiment_name` from.

**Schema (`prisma/schema.prisma`):** Added to `Contact`:
- `assigned_experiment_id Int?`
- `experiment_nickname String?`
- Relation `AssignedExperiment FarmExperiment?` (`onDelete: SetNull`)

Added back-relation `AssignedContacts Contact[]` to `FarmExperiment`.

**Backend:**
- `app/api/contacts/[id]/route.ts` (`PUT`): accepts and saves both new fields.
- `app/api/contacts/by-phone/[phone]/route.ts`: now selects `experiment_nickname` and the related `AssignedExperiment.experiment_name`, returns `experiment_name: nickname || real_name || ""`. This is the endpoint that actually fixed the "Unknown" bug, since it's what `fdl_client.fdl_resolve_token` calls.
- `app/api/contacts/route.ts` (`GET`): same computed `experiment_name` added, since this is `fdl_client.py`'s fallback path if `by-phone` ever 404s.

**UI (`app/(dashboard)/whatsapp/whatsapp-client.tsx`):** New "Assign" button (tag icon) opens a modal with a dropdown of the farmer's farm's experiments (via the existing `GET /api/experiments/{farmId}`) and a nickname text field. On save, the modal re-fetches the full contact first and re-sends every field on `PUT`, not just the two new ones, since that route is a full overwrite and would otherwise blank out fields like email.

## 2. WhatsApp/SMS channel toggle and message templates

Ported forward from the `whatsapp-integration` branch on the `DigitAgforOFE/FDL_Dashboard` fork, which had this work but was never merged into `main` and had since fallen behind (it predated the Experiments/Tasks features entirely). Only the relevant logic was ported, not the branch wholesale.

**Schema:** Added to `Contact`: `channel String?` (`"whatsapp" | "sms" | null`).

Added new model `MessageTemplate` (`id`, `name`, `content`, `created_at`).

**Backend:**
- `app/api/whatsapp/send/route.ts`: now accepts and forwards `channel` to the bot's `/send-message` endpoint (the bot already supported this parameter; the dashboard route just wasn't sending it).
- `app/api/contacts/[id]/route.ts`: added a `PATCH` handler (separate from the existing full-overwrite `PUT`) for safe partial updates, used by the inline channel dropdown so it doesn't risk wiping other fields.
- New: `app/api/message-templates/route.ts` (`GET` list, `POST` create) and `app/api/message-templates/[id]/route.ts` (`DELETE`).

**UI:** Channel dropdown column (None/WhatsApp/SMS) added to the messaging table, persisted via `PATCH`. The send-message modal now shows a "Saved messages" panel to reuse templates and a "Save as template" link to create new ones.

**Page query (`app/(dashboard)/whatsapp/page.tsx`):** broadened from `where: { whatsapp: true }` to `where: { OR: [{ whatsapp: true }, { channel: { not: null } }] }` so SMS-only contacts (channel set, `whatsapp` false) also appear in the list.

## 3. Editable onboarding message (IRB compliance)

**Problem:** The onboarding message was hardcoded in `whatsapp-client.tsx`. Any IRB-driven wording change required a code change and redeploy.

**Approach:** Reused the existing generic `SiteConfig` key-value table (already used for the edit-mode toggle), rather than adding a new model. Stored under key `"onboarding_message"`.

**New files:**
- `lib/onboarding-message.ts`: `getOnboardingMessage()` / `setOnboardingMessage()`, with the original hardcoded text kept as `DEFAULT_ONBOARDING_MESSAGE`, the fallback until an admin saves a custom version.
- `app/api/admin/onboarding-message/route.ts`: admin-only `GET`/`POST`.
- `app/(dashboard)/admin/onboarding-message-editor.tsx`: textarea editor component, modeled on the existing `edit-mode-toggle.tsx`.

**Wired in:**
- `app/(dashboard)/admin/page.tsx`: new "Onboarding Message" card, admin-only.
- `app/(dashboard)/whatsapp/page.tsx`: fetches the current message server-side and passes it to `WhatsAppClient` as a prop, replacing the removed hardcoded constant.

## 4. Persistent onboarding tracking across channels

**Problem:** "Onboarded" status was only React state in the browser, it reset on every page refresh, and onboarding via one channel (e.g. SMS) didn't grey out the button if viewed via WhatsApp, since the two weren't actually distinguished anywhere, just never persisted at all.

**Schema:** Added `onboarded_at DateTime?` to `Contact`.

**Backend:** `PATCH /api/contacts/[id]` extended to accept `onboarded_at`.

**UI:** `page.tsx` now selects `onboarded_at` and passes `onboarded: boolean` per contact. `whatsapp-client.tsx` seeds its `onboarded` state from this on load (instead of an empty `Set`), and on a successful onboarding send, both updates local state immediately and `PATCH`es `onboarded_at` to persist it, channel-agnostic since it lives on the `Contact` record itself.

## 5. Cosmetic rename

- `components/sidebar.tsx`: nav label "WhatsApp" → "Messaging".
- `whatsapp-client.tsx`: table title and stat label updated to "Messaging" wording.
- The URL (`/whatsapp`) and internal component/type names (`WhatsAppClient`, `WhatsAppRow`, etc.) were deliberately left unchanged, renaming those would mean moving the route folder and updating every import, a separate and riskier change not yet done.

## Known gaps / follow-ups

- No numbered SQL migration file was written for any of the above; `prisma db push` was used directly against the local dev database. A real migration should be written before deploying to production.
- The page is still served at `/whatsapp` despite being relabeled "Messaging" in the nav and UI text.
- Twilio's WhatsApp and SMS webhook URLs were temporarily pointed at an ngrok tunnel for local testing during this session:
  - WhatsApp production URL: `https://bot.farmersdatalab.org/webhook/1`
  - SMS production URL: `https://bot.farmersdatalab.org/webhook/sms`
  Both must be reverted in the Twilio console before relying on the production bot again.
