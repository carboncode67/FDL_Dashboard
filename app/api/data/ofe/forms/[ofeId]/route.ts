import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseOfeId, upsertOfeForm, validateFormInput, withOfeService } from "@/lib/ofe-sync";

type Params = { params: Promise<{ ofeId: string }> };

// PUT /api/data/ofe/forms/[ofeId] — create or replace an OFE-owned form from
// OFE's whole-form snapshot (fields + assignments). Service-only; see
// lib/ofe-sync.ts. Returns { id, assignments: [{ ofe_id, resolved }] }.
export async function PUT(req: Request, { params }: Params) {
  return withOfeService(req, async (service) => {
    const ofeId = parseOfeId((await params).ofeId);
    if (ofeId == null) return NextResponse.json({ error: "Invalid ofe id" }, { status: 400 });
    const input = validateFormInput(await req.json().catch(() => null));
    if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
    return NextResponse.json(await upsertOfeForm(ofeId, input, service));
  });
}

// DELETE /api/data/ofe/forms/[ofeId] — OFE deleted the form. Cascades to its
// responses here, same as deleting it in the web UI (OFE pulls responses
// every sync, and its own delete requires an export first).
export async function DELETE(req: Request, { params }: Params) {
  return withOfeService(req, async () => {
    const ofeId = parseOfeId((await params).ofeId);
    if (ofeId == null) return NextResponse.json({ error: "Invalid ofe id" }, { status: 400 });
    const { count } = await prisma.form.deleteMany({ where: { ofe_id: ofeId } });
    return NextResponse.json({ deleted: count });
  });
}
