-- Loaned-equipment sign-out/return tracking. The "Drones" reference-data
-- category is now labeled "Equipment" in the UI, but the underlying Drones
-- table/model is unchanged -- this just adds loan tracking on top of it.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Equipment_Loans" (
  id SERIAL PRIMARY KEY,
  drone_id INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Drones"(id) ON DELETE CASCADE,
  contact_id INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Contacts"(id) ON DELETE CASCADE,
  signed_out_by TEXT REFERENCES "public"."users"(id) ON DELETE SET NULL,
  signed_out_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at TIMESTAMPTZ NOT NULL,
  returned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_loans_drone ON "pgntarg2udzj1f3"."Equipment_Loans"(drone_id);
CREATE INDEX IF NOT EXISTS idx_equipment_loans_contact ON "pgntarg2udzj1f3"."Equipment_Loans"(contact_id);
