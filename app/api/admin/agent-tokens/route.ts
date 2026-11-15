import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateAgentToken } from "@/lib/agent/auth";
import { withSleuthAdmin } from "@/lib/agent/admin";

const DEFAULT_EXPIRY_DAYS = 90;
const MAX_EXPIRY_DAYS = 365;

// GET /api/admin/agent-tokens — this lab's Data Sleuth tokens (never the secret).
export async function GET() {
  return withSleuthAdmin(async ({ labId }) => {
    const tokens = await prisma.agentToken.findMany({
      where: { lab_id: labId },
      select: {
        id: true, name: true, token_prefix: true, scopes: true, created_at: true,
        expires_at: true, revoked_at: true, last_used_at: true,
      },
      orderBy: { created_at: "desc" },
    });
    return NextResponse.json({ tokens });
  });
}

// POST /api/admin/agent-tokens {name, read_only?, expires_in_days?}
// Returns the raw token exactly once; only its sha256 is stored.
export async function POST(req: Request) {
  return withSleuthAdmin(async ({ session, labId }) => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    const days =
      typeof body.expires_in_days === "number" && body.expires_in_days > 0
        ? Math.min(Math.floor(body.expires_in_days), MAX_EXPIRY_DAYS)
        : DEFAULT_EXPIRY_DAYS;

    const { raw, hash, prefix } = generateAgentToken();
    const token = await prisma.agentToken.create({
      data: {
        lab_id: labId,
        name,
        token_hash: hash,
        token_prefix: prefix,
        scopes: body.read_only === true ? ["read"] : ["read", "write"],
        created_by_id: session.user.id,
        expires_at: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      },
      select: { id: true, name: true, token_prefix: true, scopes: true, created_at: true, expires_at: true },
    });
    return NextResponse.json({ ...token, token: raw }, { status: 201 });
  });
}
