import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAgentAdmin } from "@/lib/agent/admin";

// GET /api/admin/agent-tags — this lab's agent tag vocabulary.
export async function GET() {
  return withAgentAdmin(async ({ labId }) => {
    const tags = await prisma.agentTagVocabulary.findMany({ where: { lab_id: labId }, orderBy: { name: "asc" } });
    return NextResponse.json({ tags });
  });
}

// POST /api/admin/agent-tags {name, description?} — the agent can only use
// tags from this list; it proposes new ones as "tag_new" recommendations.
export async function POST(req: Request) {
  return withAgentAdmin(async ({ labId }) => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 300) || null : null;

    const clash = await prisma.agentTagVocabulary.findFirst({
      where: { lab_id: labId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (clash) return NextResponse.json({ error: "A tag with that name already exists" }, { status: 409 });

    const tag = await prisma.agentTagVocabulary.create({ data: { lab_id: labId, name, description } });
    return NextResponse.json(tag, { status: 201 });
  });
}
