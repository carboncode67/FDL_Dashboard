import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";
import { toCsv } from "@/lib/csv";

// CSV of every logged time session for one 'duration' geofence — one row per field visit
// (field blank = whole-zone session), oldest first. Same data as the Time Sessions page.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const geofenceId = parseInt(id);
  if (isNaN(geofenceId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const geofence = await prisma.geofence.findUnique({ where: { id: geofenceId } });
  if (!geofence) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sessions = await prisma.geofenceZoneTimeSession.findMany({
    where: { geofence_id: geofenceId },
    include: {
      Contact: { select: { name: true } },
      User: { select: { name: true, email: true } },
      Field: { select: { Name: true } },
      Zone: { include: { Farm: { select: { Farm_Name: true } } } },
    },
    orderBy: { entered_at: "asc" },
  });

  const csv = toCsv(
    ["session_id", "recipient", "farm", "field", "entered_at", "exited_at", "duration_seconds", "duration_minutes", "reported_at"],
    sessions.map((s) => [
      s.id,
      s.Contact?.name ?? s.User?.name ?? s.User?.email ?? "Unknown",
      s.Zone.Farm.Farm_Name ?? `Farm #${s.Zone.farm_id}`,
      s.field_id === null ? "" : (s.Field?.Name ?? `Field #${s.field_id}`),
      s.entered_at.toISOString(),
      s.exited_at.toISOString(),
      s.duration_seconds,
      (s.duration_seconds / 60).toFixed(1),
      s.received_at.toISOString(),
    ])
  );

  const safeTitle = geofence.title.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "geofence";
  // BOM so Excel reads UTF-8 correctly.
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeTitle}_time_sessions.csv"`,
    },
  });
  });
}
