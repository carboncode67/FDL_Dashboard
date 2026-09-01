import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { matchAndTriggerPipelines } from "@/lib/pipeline-match";

// Normalized label matching: case-, whitespace- and underscore-insensitive.
function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[\s_]+/g, " ").trim();
}

async function loadContext(experimentTestId: number, dataTableId: number) {
  const et = await prisma.experimentTest.findUnique({
    where: { id: experimentTestId },
    select: { id: true, test_id: true, Test: { select: { id: true, Test_Name: true } } },
  });
  if (!et) return { error: NextResponse.json({ error: "Experiment test not found" }, { status: 404 }) };

  const table = await prisma.dataTable.findUnique({
    where: { id: dataTableId },
    include: { FieldDefinitions: { orderBy: { col_index: "asc" } } },
  });
  if (!table) return { error: NextResponse.json({ error: "Table not found" }, { status: 404 }) };

  const isHome = table.test_id === et.test_id;
  const isJoined = isHome
    ? true
    : (await prisma.testDataTable.findUnique({
        where: { Tests_id_Tables_id: { Tests_id: et.test_id, Tables_id: dataTableId } },
      })) !== null;
  if (!isJoined) {
    return { error: NextResponse.json({ error: "This table is not used by this test" }, { status: 422 }) };
  }

  return { et, table };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; tableId: string }> }
) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const { id, tableId } = await params;
  const experimentTestId = parseInt(id);
  const dataTableId = parseInt(tableId);
  if (isNaN(experimentTestId) || isNaN(dataTableId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const ctx = await loadContext(experimentTestId, dataTableId);
  if ("error" in ctx) return ctx.error;

  const rows = await prisma.dataTableRow.findMany({
    where: { experiment_test_id: experimentTestId, data_table_id: dataTableId },
    orderBy: { row_index: "asc" },
  });

  return NextResponse.json({
    experiment_test_id: experimentTestId,
    test: { id: ctx.et.Test.id, name: ctx.et.Test.Test_Name },
    table: {
      id: ctx.table.id,
      name: ctx.table.name,
      description: ctx.table.description,
      data_processing_instructions: ctx.table.data_processing_instructions,
    },
    columns: ctx.table.FieldDefinitions,
    rows: rows.map((r) => ({
      row_index: r.row_index,
      data: r.data,
      source_file: r.source_file,
      ingested_at: r.ingested_at,
    })),
  });
}

// Bulk ingest rows for one DataTable used by an experiment test.
// Body: { columns: string[], rows: (string|number|null)[][], source_file?, mode?: "replace" | "append" }
// Submitted columns are matched to the table's Data_Table_Field_Definitions by normalized label.
// Missing template columns → 422 (client writes conflict.txt from `missing`).
// Extra submitted columns → ignored, reported in `ignored_columns`.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; tableId: string }> }
) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const { id, tableId } = await params;
  const experimentTestId = parseInt(id);
  const dataTableId = parseInt(tableId);
  if (isNaN(experimentTestId) || isNaN(dataTableId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const ctx = await loadContext(experimentTestId, dataTableId);
  if ("error" in ctx) return ctx.error;
  const { table } = ctx;

  const defs = table.FieldDefinitions;
  if (defs.length === 0) {
    return NextResponse.json(
      { error: "Table has no data template columns defined" },
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
      ? ((await prisma.dataTableRow.aggregate({
          where: { experiment_test_id: experimentTestId, data_table_id: dataTableId },
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
      data_table_id: dataTableId,
      experiment_test_id: experimentTestId,
      row_index: startIndex + i,
      data: obj,
      source_file: sourceFile,
    };
  });

  await prisma.$transaction([
    ...(mode === "replace"
      ? [prisma.dataTableRow.deleteMany({ where: { experiment_test_id: experimentTestId, data_table_id: dataTableId } })]
      : []),
    prisma.dataTableRow.createMany({ data }),
  ]);

  const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  matchAndTriggerPipelines({
    table: "test-data-rows",
    id: experimentTestId,
    data_table_id: dataTableId,
    inputFileUrl: `${baseUrl}/api/data/experiment-tests/${experimentTestId}/tables/${dataTableId}/rows`,
  }).catch((err) => console.error("[experiment-tests tables rows POST] pipeline trigger failed", err));

  return NextResponse.json({
    ok: true,
    mode,
    inserted: data.length,
    ignored_columns: ignored,
  });
}
