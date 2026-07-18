import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseEntitiesParam, searchAll } from "@/lib/search";

// GET /api/search?q=grazing+collar[&entities=farms,experiments][&limit=50]
// Session-auth whole-DB keyword search backing the global search dialog.
export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
