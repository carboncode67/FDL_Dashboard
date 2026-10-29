import type { Feature, FeatureCollection, Point } from "geojson";

// Point CSVs for the unified farm upload box: a CSV counts as spatial when its
// header has a recognisable coordinate pair — lat/lon-style names (geographic)
// or x/y-style names (projected, CRS set in the upload dialog). Client-safe (no
// Node imports): components/farm-data-upload.tsx sniffs just the header line to
// decide whether to offer the "display this data?" dialog, and
// app/api/farms/[id]/layers parses the whole file with the same rules.

const Y_NAMES = ["lat", "latitude", "y", "northing", "lat_dd", "y_coord", "ycoord", "point_y"];
const X_NAMES = ["lon", "lng", "long", "longitude", "x", "easting", "lon_dd", "long_dd", "x_coord", "xcoord", "point_x"];

function norm(h: string): string {
  return h.trim().replace(/^﻿/, "").toLowerCase().replace(/[\s-]+/g, "_");
}

// Minimal RFC 4180 line splitter — handles quoted fields with embedded commas
// and doubled quotes, which is all a lab-instrument export realistically needs.
// Embedded newlines inside quotes are not supported.
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

export interface CsvCoordColumns {
  xIndex: number;
  yIndex: number;
  xName: string;
  yName: string;
}

export function detectCoordColumns(headers: string[]): CsvCoordColumns | null {
  const normed = headers.map(norm);
  const yIndex = normed.findIndex((h) => Y_NAMES.includes(h));
  const xIndex = normed.findIndex((h) => X_NAMES.includes(h));
  if (yIndex === -1 || xIndex === -1 || xIndex === yIndex) return null;
  return { xIndex, yIndex, xName: headers[xIndex].trim(), yName: headers[yIndex].trim() };
}

export function parsePointsCsv(text: string): FeatureCollection<Point> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) throw new Error("CSV is empty");
  const headers = splitCsvLine(lines[0]);
  const cols = detectCoordColumns(headers);
  if (!cols) throw new Error("No coordinate columns found (expected lat/lon or x/y)");

  const features: Feature<Point>[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = splitCsvLine(lines[r]);
    const x = parseFloat(cells[cols.xIndex]);
    const y = parseFloat(cells[cols.yIndex]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const properties: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (i !== cols.xIndex && i !== cols.yIndex) properties[h.trim()] = cells[i] ?? "";
    });
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: [x, y] }, properties });
  }
  if (features.length === 0) throw new Error("No rows with numeric coordinates");
  return { type: "FeatureCollection", features };
}
