import { prisma } from "@/lib/prisma";

// Case-, whitespace- and underscore-insensitive — same rule the
// experiment-tests rows ingest route uses to match submitted columns to a
// Data Table's field definitions.
function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[\s_]+/g, " ").trim();
}

// Parses just the header row of a CSV file (first line, comma-separated,
// tolerant of quoted fields) — good enough for template matching; full
// row/type parsing isn't needed here, that's ingest_test_data.py's job via
// the experiment-tests rows endpoint.
function parseCsvHeader(buf: Buffer): string[] | null {
  const text = buf.toString("utf-8");
  const firstLine = text.split(/\r?\n/, 1)[0];
  if (!firstLine) return null;

  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < firstLine.length; i++) {
    const c = firstLine[i];
    if (inQuotes) {
      if (c === '"') {
        if (firstLine[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cells.push(cur); cur = ""; }
      else cur += c;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

export interface TemplateMatch {
  dataTableId: number;
  testId: number | null;
  droneId: number | null;
}

// Attempts to match an uploaded file's column headers against every known
// Data Table template — Test-homed, Equipment(Drone)-homed, or free-floating
// (a shared library entry, e.g. one not tied to any single Test).
//
// Only CSV headers are inspected today — .xlsx support needs a parser
// dependency this repo doesn't have yet, so .xlsx documents fall through
// unmatched (they're still eligible for a wildcard "documents" pipeline,
// i.e. one with no match_data_table_id set).
//
// Requires an EXACT match — every one of the template's columns must be
// present in the uploaded header (extra columns in the file are fine, same
// tolerance as the rows ingest route). A partial match is treated as "not
// this template" rather than guessed at. If more than one template matches
// equally, the document is left unmatched rather than picking one — wrong
// auto-classification is worse than none.
export async function matchDocumentToTemplate(
  fileBuffer: Buffer,
  ext: string
): Promise<TemplateMatch | null> {
  if (ext !== ".csv") return null;

  const header = parseCsvHeader(fileBuffer);
  if (!header || header.length === 0) return null;
  const normalizedHeader = new Set(header.map(normalizeLabel));

  const tables = await prisma.dataTable.findMany({
    include: { FieldDefinitions: true },
  });

  const matches = tables.filter(
    (t) =>
      t.FieldDefinitions.length > 0 &&
      t.FieldDefinitions.every((d) => normalizedHeader.has(normalizeLabel(d.label)))
  );

  if (matches.length !== 1) return null;
  const match = matches[0];
  return { dataTableId: match.id, testId: match.test_id, droneId: match.drone_id };
}
