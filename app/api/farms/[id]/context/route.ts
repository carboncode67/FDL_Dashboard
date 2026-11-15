import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/roles";
import { requestContextFetch, ContextRequestError } from "@/lib/context-fetch";
import { isProductCode, geodartHasKey, PRODUCTS, DEFAULT_PRODUCTS, type ProductCode } from "@/lib/geodart";
import { serializeContextJob } from "@/lib/context-types";
import { runWithTenant } from "@/lib/lab-db";

export const runtime = "nodejs";

function prevCalendarYear(): { start: string; end: string } {
  const y = new Date().getUTCFullYear() - 1;
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const farmId = parseInt(id);
  if (isNaN(farmId)) return NextResponse.json({ error: "Invalid farm id" }, { status: 400 });

  const jobs = await prisma.contextFetchJob.findMany({
    where: { farm_id: farmId },
    include: { Rasters: { orderBy: { id: "asc" } } },
    orderBy: { created_at: "desc" },
    take: 20,
  });
  return NextResponse.json(jobs.map(serializeContextJob), { headers: { "Cache-Control": "no-store" } });
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const farmId = parseInt(id);
  if (isNaN(farmId)) return NextResponse.json({ error: "Invalid farm id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const rawProducts: unknown = body.products;
  const products: ProductCode[] = Array.isArray(rawProducts) && rawProducts.length
    ? (rawProducts.filter((p): p is string => typeof p === "string").filter(isProductCode) as ProductCode[])
    : [...DEFAULT_PRODUCTS];
  if (!products.length) {
    return NextResponse.json({ error: "No valid products selected" }, { status: 400 });
  }
  const blockedKeyed = products.filter((p) => PRODUCTS[p].needsKey && !geodartHasKey);
  if (blockedKeyed.length) {
    return NextResponse.json(
      { error: `${blockedKeyed.join(", ")} require a GeoDaRT key that isn't configured yet` },
      { status: 400 },
    );
  }

  const bufferM = Number.isFinite(body.buffer_m) ? Math.max(0, Number(body.buffer_m)) : 150;
  const win = prevCalendarYear();
  const startDate = typeof body.start_date === "string" && body.start_date ? body.start_date : win.start;
  const endDate = typeof body.end_date === "string" && body.end_date ? body.end_date : win.end;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return NextResponse.json({ error: "Dates must be YYYY-MM-DD" }, { status: 400 });
  }

  const uid = (session.user as { id?: string }).id;
  try {
    const job = await requestContextFetch({
      farmId, products, startDate, endDate, bufferM,
      requestedBy: uid && uid !== "bootstrap" ? uid : null,
    });
    return NextResponse.json(serializeContextJob(job), { status: 201 });
  } catch (err) {
    if (err instanceof ContextRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.message === "Farm not found" ? 404 : 400 });
    }
    throw err;
  }
  });
}
