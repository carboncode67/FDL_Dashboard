import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/roles";
import { geojsonBounds, unionBounds, bboxRing } from "@/lib/geo";
import { submitJob, isProductCode, geodartHasKey, PRODUCTS, DEFAULT_PRODUCTS, type ProductCode } from "@/lib/geodart";
import { serializeContextJob } from "@/lib/context-types";

export const runtime = "nodejs";

function prevCalendarYear(): { start: string; end: string } {
  const y = new Date().getUTCFullYear() - 1;
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const farm = await prisma.farm.findUnique({
    where: { id: farmId },
    include: {
      Fields: { select: { geometry: true } },
      ExperimentZones: { select: { geometry: true } },
    },
  });
  if (!farm) return NextResponse.json({ error: "Farm not found" }, { status: 404 });

  const bounds = unionBounds([
    ...farm.Fields.map((f) => geojsonBounds(f.geometry)),
    ...farm.ExperimentZones.map((z) => geojsonBounds(z.geometry)),
  ]);
  if (!bounds) {
    return NextResponse.json(
      { error: "Farm has no field or zone geometry — draw a field boundary first" },
      { status: 400 },
    );
  }
  const aoiRing = bboxRing(bounds, bufferM);

  const uid = (session.user as { id?: string }).id;
  const jobData = {
    farm_id: farmId,
    requested_by: uid && uid !== "bootstrap" ? uid : null,
    products,
    start_date: new Date(`${startDate}T00:00:00Z`),
    end_date: new Date(`${endDate}T00:00:00Z`),
    buffer_m: bufferM,
    aoi: aoiRing,
    export_format: "COG",
  };

  try {
    const { jobId, requestId } = await submitJob({ aoiRing, startDate, endDate, products, exportFormat: "COG" });
    const job = await prisma.contextFetchJob.create({
      data: { ...jobData, status: "submitted", geodart_job_id: jobId, geodart_request_id: requestId, submitted_at: new Date() },
      include: { Rasters: true },
    });
    return NextResponse.json(serializeContextJob(job), { status: 201 });
  } catch (err) {
    // GeoDaRT unreachable / slow — persist as pending; the cron sweep retries submit.
    const job = await prisma.contextFetchJob.create({
      data: { ...jobData, status: "pending", error_message: err instanceof Error ? err.message : String(err) },
      include: { Rasters: true },
    });
    return NextResponse.json(serializeContextJob(job), { status: 201 });
  }
}
