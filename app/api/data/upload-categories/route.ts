import { NextResponse } from "next/server";
import { authenticateUpload } from "@/lib/upload-auth";
import { prisma } from "@/lib/prisma";

// Bearer-token counterpart to the session-auth /api/upload-categories, for
// external consumers (e.g. OFE Dashboard) that need to resolve a category
// name to the media types it applies to and its metric definitions.
export async function GET(req: Request) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const categories = await prisma.uploadCategory.findMany({
    orderBy: { sort_order: "asc" },
    include: { Metrics: { orderBy: { sort_order: "asc" } } },
  });

  return NextResponse.json(
    categories.map((c) => ({
      id: c.id,
      name: c.name,
      media_types: c.media_types,
      metrics: c.Metrics.map((m) => ({
        id: m.id,
        label: m.label,
        field_type: m.field_type,
        unit: m.unit,
        options: m.options,
      })),
    }))
  );
}
