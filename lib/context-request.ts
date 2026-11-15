import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requestContextFetch, requestContextExtension, ContextRequestError } from "@/lib/context-fetch";
import { parseExtensionBody } from "@/lib/context-request-body";
import { isProductCode, geodartHasKey, PRODUCTS, DEFAULT_PRODUCTS, type ProductCode } from "@/lib/geodart";
import { serializeContextJob } from "@/lib/context-types";
import { getContextCoverage } from "@/lib/context-coverage";

// Shared by the session route (POST /api/farms/[id]/context) and its Data API
// twin for OFE_Dashboard (POST /api/data/farms/[id]/context): one place that
// turns a request body into a pull, an Update or an Expand. Auth and the
// farm-access check stay in the routes.

function prevCalendarYear(): { start: string; end: string } {
  const y = new Date().getUTCFullYear() - 1;
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

export async function contextJobsForFarm(farmId: number, take = 20) {
  const jobs = await prisma.contextFetchJob.findMany({
    where: { farm_id: farmId },
    include: { Rasters: { orderBy: { id: "asc" } } },
    orderBy: { created_at: "desc" },
    take,
  });
  return jobs.map(serializeContextJob);
}

/**
 * `mode: "update" | "expand"` → planned jobs `{ jobs, groups, skipped }`
 * (201 when something was queued, 200 when there was nothing new).
 * Otherwise a plain pull → the one job (201), exactly as before.
 */
export async function handleContextPost(farmId: number, body: Record<string, unknown>, requestedBy: string | null) {
  if (body.mode === "update" || body.mode === "expand") {
    const plan = parseExtensionBody(body);
    if (typeof plan === "string") return NextResponse.json({ error: plan }, { status: 400 });
    try {
      const result = await requestContextExtension({ farmId, plan, requestedBy });
      return NextResponse.json(
        { jobs: result.jobs.map(serializeContextJob), groups: result.groups, skipped: result.skipped },
        { status: result.jobs.length ? 201 : 200 },
      );
    } catch (err) {
      if (err instanceof ContextRequestError) return NextResponse.json({ error: err.message }, { status: 409 });
      throw err;
    }
  }

  const rawProducts: unknown = body.products;
  const products: ProductCode[] =
    Array.isArray(rawProducts) && rawProducts.length
      ? (rawProducts.filter((p): p is string => typeof p === "string").filter(isProductCode) as ProductCode[])
      : [...DEFAULT_PRODUCTS];
  if (!products.length) return NextResponse.json({ error: "No valid products selected" }, { status: 400 });
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

  try {
    const job = await requestContextFetch({ farmId, products, startDate, endDate, bufferM, requestedBy });
    return NextResponse.json(serializeContextJob(job), { status: 201 });
  } catch (err) {
    if (err instanceof ContextRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.message === "Farm not found" ? 404 : 400 });
    }
    throw err;
  }
}

/** GET …/context/coverage[?mode=…] — coverage, plus the planner's dry run when a mode is given. */
export async function handleCoverageGet(farmId: number, url: URL) {
  const q = url.searchParams;
  const mode = q.get("mode");
  if (!mode) {
    return NextResponse.json({ coverage: await getContextCoverage(farmId) }, { headers: { "Cache-Control": "no-store" } });
  }
  const plan = parseExtensionBody({
    mode,
    start_date: q.get("start_date") ?? undefined,
    end_date: q.get("end_date") ?? undefined,
    products: q.get("products") ? q.get("products")!.split(",") : undefined,
  });
  if (typeof plan === "string") return NextResponse.json({ error: plan }, { status: 400 });
  try {
    const r = await requestContextExtension({ farmId, plan, dryRun: true });
    return NextResponse.json({ coverage: r.coverage, groups: r.groups, skipped: r.skipped }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ContextRequestError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
}
