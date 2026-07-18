-- Link lab form documents (PDF/Excel) to Tests (Planned Changes #83)
ALTER TABLE "pgntarg2udzj1f3"."Documents"
  ADD COLUMN IF NOT EXISTS test_id INT
    REFERENCES "pgntarg2udzj1f3"."Tests"(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_documents_test_id
  ON "pgntarg2udzj1f3"."Documents"(test_id);
