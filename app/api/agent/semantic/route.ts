import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withAgent } from "@/lib/agent/auth";

// mxbai-embed-large, the model Interview Parser embeds Interview_Chunks with.
const EMBEDDING_DIM = 1024;
const MAX_K = 20;
const CHUNK_TYPES = ["farm_profile", "experiment", "main_form"];

// POST /api/agent/semantic {embedding: number[1024], k?, farm_id?, chunk_type?}
// pgvector search over interview chunks, lab-scoped through Farms.lab_id.
// The runner embeds the query (it's the only sandbox container that can
// reach Ollama) and the broker forwards the vector — the agent never gets a
// DB connection, unlike rag.py's direct nocodb one.
export async function POST(req: Request) {
  return withAgent(req, "semantic", async (agent) => {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const embedding = body?.embedding;
    if (
      !Array.isArray(embedding) ||
      embedding.length !== EMBEDDING_DIM ||
      !embedding.every((v) => typeof v === "number" && Number.isFinite(v))
    ) {
      return NextResponse.json({ error: `embedding must be ${EMBEDDING_DIM} finite numbers` }, { status: 400 });
    }
    const k = Math.min(Math.max(typeof body?.k === "number" ? Math.floor(body.k) : 8, 1), MAX_K);
    const farmId = typeof body?.farm_id === "number" && Number.isInteger(body.farm_id) ? body.farm_id : null;
    const chunkType = typeof body?.chunk_type === "string" && CHUNK_TYPES.includes(body.chunk_type) ? body.chunk_type : null;

    const vector = `[${embedding.join(",")}]`;
    const hits = await prisma.$queryRaw<
      { id: number; farm_id: number; farm_name: string | null; chunk_type: string; experiment_name: string | null; content: string; distance: number }[]
    >`
      SELECT ic.id, ic.farm_id, f."Farm_Name" AS farm_name, ic.chunk_type, ic.experiment_name, ic.content,
             (ic.embedding <=> ${vector}::vector) AS distance
        FROM "pgntarg2udzj1f3"."Interview_Chunks" ic
        JOIN "pgntarg2udzj1f3"."Farms" f ON f.id = ic.farm_id
       WHERE f.lab_id = ${agent.labId}
         AND ic.embedding IS NOT NULL
         ${farmId != null ? Prisma.sql`AND ic.farm_id = ${farmId}` : Prisma.empty}
         ${chunkType != null ? Prisma.sql`AND ic.chunk_type = ${chunkType}` : Prisma.empty}
       ORDER BY ic.embedding <=> ${vector}::vector
       LIMIT ${k}`;

    return NextResponse.json({ hits: hits.map((h) => ({ ...h, distance: Number(h.distance) })) });
  });
}
