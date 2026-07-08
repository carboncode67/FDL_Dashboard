import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";

const SELECT = {
  id: true,
  experiment_name: true,
  start_date: true,
  hypothesis: true,
  experiment_desc: true,
  measurements: true,
  criteria: true,
  lab_description: true,
  project_id: true,
};

// Merge-update: only write fields that are currently null/empty in the DB record.
// This prevents the pipeline from overwriting fields a researcher has already filled in.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; experimentId: string }> },
) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const { id, experimentId } = await params;
  const farmId = parseInt(id);
  const expId = parseInt(experimentId);
  if (isNaN(farmId) || isNaN(expId))
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const existing = await prisma.farmExperiment.findFirst({
    where: { id: expId, farm_id: farmId },
    select: SELECT,
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const {
    experiment_name, start_date, hypothesis, experiment_desc,
    measurements, criteria, lab_description,
  } = body;

  const data: Record<string, unknown> = {};
  const updatedFields: string[] = [];

  const merge = (key: keyof typeof existing, incoming: unknown) => {
    if (incoming != null && incoming !== "" && !existing[key]) {
      data[key] = incoming;
      updatedFields.push(key);
    }
  };

  merge("experiment_name", experiment_name);
  merge("hypothesis", hypothesis);
  merge("experiment_desc", experiment_desc);
  merge("measurements", measurements);
  merge("criteria", criteria);
  merge("lab_description", lab_description);
  if (start_date && !existing.start_date) {
    data.start_date = new Date(start_date);
    updatedFields.push("start_date");
  }

  if (updatedFields.length === 0) {
    return NextResponse.json({ id: expId, updated_fields: [], message: "All fields already filled" });
  }

  const updated = await prisma.farmExperiment.update({
    where: { id: expId },
    data,
    select: SELECT,
  });

  return NextResponse.json({ ...updated, updated_fields: updatedFields });
}
