-- Pipeline "instances" (runs) gain:
--  * prompt          -- an operator instruction for a re-run, folded into the
--                       processor's LLM wiring step ("set output resolution to 5m")
--  * processor_note  -- a short status message the processor emits back
--                       ("couldn't process, CRS unclear")
--  * trigger_data_table_id -- which Data Table's ingest fired an auto-run, so a
--                       re-run can re-pull that table's current rows
ALTER TABLE "pgntarg2udzj1f3"."Pipeline_Runs"
  ADD COLUMN IF NOT EXISTS prompt                TEXT,
  ADD COLUMN IF NOT EXISTS processor_note        TEXT,
  ADD COLUMN IF NOT EXISTS trigger_data_table_id INT;
