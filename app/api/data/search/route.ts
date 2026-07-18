import { NextResponse } from "next/server";
import { authenticateUpload } from "@/lib/upload-auth";
import { parseEntitiesParam, searchAll } from "@/lib/search";

// GET /api/data/search?q=grazing+collar[&entities=farms,experiments][&limit=50]
// Bearer-token variant of the whole-DB keyword search for external agents
// and scripts (same query logic as /api/search via lib/search.ts).
export async function GET(req: Request) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  if (q.trim().length < 2) {
    return NextResponse.json({ query: q, hits: [] });
  }
  const hits = await searchAll(q, {
    entities: parseEntitiesParam(url.searchParams.get("entities")),
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
  });
  return NextResponse.json({ query: q.trim(), hits });
}
