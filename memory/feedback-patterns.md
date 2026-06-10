---
name: feedback-patterns
description: Confirmed implementation decisions and preferences for this project
metadata:
  type: feedback
---

**Keep Lab Members and Contacts as separate tables.**
Do not add FKs linking them. They serve different purposes: Lab Members = personnel directory; Contacts = mobile app upload access.
**Why:** User explicitly said "There is no real need to link the lab members to the contacts table, they have separate functions and can remain separate."
**How to apply:** If a feature needs both (e.g. a lab member getting app access), solve it by adding fields directly to the relevant table (e.g. `token` on Lab Members) rather than creating a FK relationship.

**Lab member uploads go to a unified table, not the per-type tables.**
Photos, recordings, notes, and locations from lab members all land in `Lab_Member_Uploads` with a `media_type` discriminator. Farmer uploads still go to Photos/Recordings/Notes/Locations.
**Why:** User wants lab member data in "one big table" with common columns (uploaded by, assigned farm, media type, date collected, status) for the sorting workflow.
**How to apply:** When adding new media types or upload fields, update `Lab_Member_Uploads` for lab member path and the specific table (Photos etc.) for the farmer path.

**Use `kind` discriminant in AuthResult, not optional-never fields.**
The pattern `{ labMember?: never }` causes TypeScript to not narrow properly in upload routes.
**Why:** Build failed with "auth.labMember is possibly undefined" when using optional-never discriminated union.
**How to apply:** Always use `{ kind: "contact"; contact: Contact } | { kind: "labMember"; labMember: LabMember }` pattern for union types used in conditionals.
