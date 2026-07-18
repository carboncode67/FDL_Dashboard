import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";

// Normalized label matching: case-, whitespace- and underscore-insensitive.
function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[\s_]+/g, " ").trim();
}

async function loadExperimentTest(id: number) {
  return prisma.experimentTest.findUnique({
    where: { id },
    include: {
      Test: {
        select: {
          id: true,
          Test_Name: true,
          TestFieldDefinitions: {
            orderBy: { col_index: "asc" },
            select: { col_index: true, field_type: true, label: true },
          },
        },
      },
    },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const experimentTestId = parseInt(id);
  if (isNaN(experimentTestId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const et = await loadExperimentTest(experimentTestId);
  if (!et) return NextResponse.json({ error: "Experiment test not found" }, { status: 404 });

  const rows = await prisma.testDataRow.findMany({
    where: { experiment_test_id: experimentTestId },
    orderBy: { row_index: "asc" },
  });

  return NextResponse.json({
    experiment_test_id: experimentTestId,
    test: { id: et.Test.id, name: et.Test.Test_Name },
    columns: et.Test.TestFieldDefinitions,
    rows: rows.map((r) => ({
      row_index: r.row_index,
      data: r.data,
      source_file: r.source_file,
      ingested_at: r.ingested_at,
    })),
  });
}

// Bulk ingest rows for an experiment test.
// Body: { columns: string[], rows: (string|number|null)[][], source_file?, mode?: "replace" | "append" }
// Submitted columns are matched to Test_Field_Definitions by normalized label.
// Missing template columns → 422 (client writes conflict.txt from `missing`).
// Extra submitted columns → ignored, reported in `ignored_columns`.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const experimentTestId = parseInt(id);
  if (isNaN(experimentTestId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const et = await loadExperimentTest(experimentTestId);
  if (!et) return NextResponse.json({ error: "Experiment test not found" }, { status: 404 });

  const defs = et.Test.TestFieldDefinitions;
  if (defs.length === 0) {
    return NextResponse.json(
      { error: "Test has no data template columns defined" },
      { status: 422 }
    );
  }

  let body: {
    columns?: unknown;
    rows?: unknown;
    source_file?: unknown;
    mode?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const columns = body.columns;
  const rows = body.rows;
  if (!Array.isArray(columns) || !columns.every((c) => typeof c === "string")) {
    return NextResponse.json({ error: "columns must be a string array" }, { status: 400 });
  }
  if (!Array.isArray(rows) || !rows.every((r) => Array.isArray(r))) {
    return NextResponse.json({ error: "rows must be an array of arrays" }, { status: 400 });
  }
  const mode = body.mode === "append" ? "append" : "replace";
  const sourceFile = typeof body.source_file === "string" ? body.source_file : null;

  // Map each submitted column position → template col_index (or null if extra)
  const defByNorm = new Map(defs.map((d) => [normalizeLabel(d.label), d]));
  const colMap: (number | null)[] = columns.map((c) => defByNorm.get(normalizeLabel(c))?.col_index ?? null);
  const matchedColIndexes = new Set(colMap.filter((c): c is number => c !== null));

  const missing = defs.filter((d) => !matchedColIndexes.has(d.col_index)).map((d) => d.label);
  const ignored = columns.filter((_, i) => colMap[i] === null);

  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: "Missing template columns", missing, ignored_columns: ignored },
      { status: 422 }
    );
  }

  const startIndex =
    mode === "append"
      ? ((await prisma.testDataRow.aggregate({
          where: { experiment_test_id: experimentTestId },
          _max: { row_index: true },
        }))._max.row_index ?? -1) + 1
      : 0;

  const data = rows.map((row, i) => {
    const obj: Record<string, string | number | null> = {};
    colMap.forEach((colIndex, j) => {
      if (colIndex === null) return;
      const v = (row as unknown[])[j];
      obj[String(colIndex)] =
        v === null || v === undefined ? null : typeof v === "number" ? v : String(v);
    });
    return {
      experiment_test_id: experimentTestId,
      row_index: startIndex + i,
      data: obj,
      source_file: sourceFile,
    };
  });

  await prisma.$transaction([
    ...(mode === "replace"
      ? [prisma.testDataRow.deleteMany({ where: { experiment_test_id: experimentTestId } })]
      : []),
    prisma.testDataRow.createMany({ data }),
  ]);

  return NextResponse.json({
    ok: true,
    mode,
    inserted: data.length,
    ignored_columns: ignored,
  });
}
