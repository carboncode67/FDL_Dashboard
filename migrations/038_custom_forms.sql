-- Custom Forms: lab members build arbitrary field-ordered forms, assign them
-- to a Contact, a lab-member User, or broadly to a Farm/Farm_Experiment, and
-- recipients submit responses via the bearer-token mobile API.
--
-- Form_Responses.data is JSONB keyed by Form_Field_Definitions.col_index (as
-- a string), NOT foreign-keyed to the field definitions -- same rule as
-- Test_Data_Rows: schema edits do delete+recreate of field defs, so response
-- history must never cascade or dangle on a schema change.
--
-- Forms are repeatable: there is deliberately no uniqueness constraint tying
-- a response to "one per recipient" -- each submission is an independent row.
-- Form_Assignments defines eligibility/visibility only, fully decoupled from
-- response history.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Forms" (
  id            SERIAL PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Form_Field_Definitions" (
  id         SERIAL PRIMARY KEY,
  form_id    INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Forms"(id) ON DELETE CASCADE,
  col_index  INT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text'
             CHECK (field_type IN ('text','number','boolean','date','select')),
  label      TEXT NOT NULL,
  required   BOOLEAN NOT NULL DEFAULT false,
  options    JSONB,
  UNIQUE (form_id, col_index)
);

-- Dedicated nullable FK columns per target kind (fixed set of 4), matching
-- the Documents/Photos pattern rather than a polymorphic (target_id, target_table)
-- pair like Task_Upload_Links/Annotations -- appropriate here since the set
-- of assignable target kinds is small and fixed, not open-ended.
CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Form_Assignments" (
  id                 SERIAL PRIMARY KEY,
  form_id            INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Forms"(id) ON DELETE CASCADE,
  contact_id         INT REFERENCES "pgntarg2udzj1f3"."Contacts"(id) ON DELETE CASCADE,
  user_id            TEXT REFERENCES public.users(id) ON DELETE CASCADE,
  farm_id            INT REFERENCES "pgntarg2udzj1f3"."Farms"(id) ON DELETE CASCADE,
  farm_experiment_id INT REFERENCES "pgntarg2udzj1f3"."Farm_Experiments"(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT form_assignments_exactly_one_target CHECK (
    (CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN farm_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN farm_experiment_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_form_assignments_form ON "pgntarg2udzj1f3"."Form_Assignments"(form_id);
CREATE INDEX IF NOT EXISTS idx_form_assignments_contact ON "pgntarg2udzj1f3"."Form_Assignments"(contact_id);
CREATE INDEX IF NOT EXISTS idx_form_assignments_user ON "pgntarg2udzj1f3"."Form_Assignments"(user_id);
CREATE INDEX IF NOT EXISTS idx_form_assignments_farm ON "pgntarg2udzj1f3"."Form_Assignments"(farm_id);
CREATE INDEX IF NOT EXISTS idx_form_assignments_experiment ON "pgntarg2udzj1f3"."Form_Assignments"(farm_experiment_id);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Form_Responses" (
  id           SERIAL PRIMARY KEY,
  form_id      INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Forms"(id) ON DELETE CASCADE,
  contact_id   INT REFERENCES "pgntarg2udzj1f3"."Contacts"(id) ON DELETE SET NULL,
  user_id      TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  farm_id      INT REFERENCES "pgntarg2udzj1f3"."Farms"(id) ON DELETE SET NULL,
  data         JSONB NOT NULL,
  content_hash TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT form_responses_exactly_one_submitter CHECK (
    (contact_id IS NOT NULL) <> (user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_form_responses_form ON "pgntarg2udzj1f3"."Form_Responses"(form_id);
CREATE INDEX IF NOT EXISTS idx_form_responses_contact ON "pgntarg2udzj1f3"."Form_Responses"(contact_id);
CREATE INDEX IF NOT EXISTS idx_form_responses_user ON "pgntarg2udzj1f3"."Form_Responses"(user_id);
CREATE INDEX IF NOT EXISTS idx_form_responses_content_hash ON "pgntarg2udzj1f3"."Form_Responses"(content_hash);
