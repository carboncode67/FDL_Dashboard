-- 033_interview_chunks.sql — RAG pipeline: interview vector embeddings
--
-- PREREQUISITE: pgvector must be installed in the PostgreSQL instance.
-- The standard postgres:18 image does NOT include it — switch to pgvector/pgvector:pg18
-- in docker-compose.yml and docker-compose.lab.yml before running this migration.
--
-- Run against both instances:
--   PGPASSWORD=teddyboy psql -h localhost -p 5433  -U nocodb -d nocodb -f migrations/033_interview_chunks.sql
--   PGPASSWORD=teddyboy psql -h localhost -p 15432 -U nocodb -d nocodb -f migrations/033_interview_chunks.sql

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS pgntarg2udzj1f3."Interview_Chunks" (
    id              SERIAL PRIMARY KEY,
    farm_id         INTEGER NOT NULL REFERENCES pgntarg2udzj1f3."Farms"(id) ON DELETE CASCADE,
    chunk_type      TEXT NOT NULL CHECK (chunk_type IN ('farm_profile', 'experiment', 'main_form')),
    experiment_name TEXT,
    content         TEXT NOT NULL,
    sources         TEXT[] NOT NULL DEFAULT '{}',
    metadata        JSONB,
    embedding       vector(1024),
    embedded_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS interview_chunks_farm_idx
    ON pgntarg2udzj1f3."Interview_Chunks"(farm_id);

CREATE INDEX IF NOT EXISTS interview_chunks_type_idx
    ON pgntarg2udzj1f3."Interview_Chunks"(farm_id, chunk_type);

-- HNSW index for fast approximate cosine similarity search.
-- Only becomes useful once embeddings are populated.
CREATE INDEX IF NOT EXISTS interview_chunks_embedding_idx
    ON pgntarg2udzj1f3."Interview_Chunks"
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
