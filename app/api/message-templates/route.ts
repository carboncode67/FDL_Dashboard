import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// GET /api/message-templates — list all templates (global, newest first)
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const templates = await prisma.messageTemplate.findMany({
    orderBy: { created_at: "desc" },
  });
  return NextResponse.json(templates);
}

// POST /api/message-templates — create a new template { name, content }
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const name = (body.name ?? "").trim();
  const content = (body.content ?? "").trim();
  if (!name || !content) {
    return NextResponse.json({ error: "name and content are required" }, { status: 400 });
  }
  const template = await prisma.messageTemplate.create({
    data: { name, content },
  });
  return NextResponse.json(template, { status: 201 });
}
