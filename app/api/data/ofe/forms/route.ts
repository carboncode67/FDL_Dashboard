import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOfeService } from "@/lib/ofe-sync";

// GET /api/data/ofe/forms — every OFE-owned form's ofe_id, so OFE's sync job
// can delete here what it has deleted on its side. Service-only (lib/ofe-sync.ts).
export async function GET(req: Request) {
  return withOfeService(req, async () => {
    const forms = await prisma.form.findMany({
      where: { ofe_id: { not: null } },
      select: { id: true, ofe_id: true },
    });
    return NextResponse.json(forms);
  });
}
