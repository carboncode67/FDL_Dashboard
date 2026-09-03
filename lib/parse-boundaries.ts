import proj4 from "proj4";
import type { Feature, FeatureCollection, Geometry, GeoJSON, Polygon } from "geojson";

// ── GeoPackage binary header parsing ────────────────────────────────────────
// GeoPackage Binary format: 2-byte magic (GP), 1-byte version, 1-byte flags,
// 4-byte SRS ID, N-byte envelope, then WKB geometry.
const ENVELOPE_BYTES: Record<number, number> = { 0: 0, 1: 32, 2: 48, 3: 48, 4: 64 };

function extractWkbFromGpkgBlob(blob: Buffer): Buffer | null {
  if (blob.length < 8) return null;
  if (blob[0] !== 0x47 || blob[1] !== 0x50) return null; // magic "GP"
  const flags = blob[3];
  const envelopeType = (flags >> 1) & 0x07;
  const envBytes = ENVELOPE_BYTES[envelopeType] ?? 0;
  const wkbOffset = 8 + envBytes;
  if (wkbOffset >= blob.length) return null;
  return blob.subarray(wkbOffset);
}

// ── KML / KMZ parsing ────────────────────────────────────────────────────────
// KML coordinates are always lon,lat[,alt] in WGS84 per the KML spec, so unlike
// GPKG/SHP there is no embedded CRS to detect — applyEpsgTransform is skipped
// for these formats in the route handler below.

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "#text" in v) return String((v as Record<string, unknown>)["#text"] ?? "").trim();
  return "";
}

function coordsFromText(text: string): number[][] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((chunk) => chunk.split(",").map(Number).slice(0, 2))
    .filter((pair) => pair.length === 2 && pair.every((n) => !Number.isNaN(n)));
}

function coordinatesOf(node: Record<string, unknown>): number[][] {
  return coordsFromText(textOf(node.coordinates));
}

function ringFromBoundary(boundary: unknown): number[][] {
  if (!boundary || typeof boundary !== "object") return [];
  const ring = (boundary as Record<string, unknown>).LinearRing;
  if (!ring || typeof ring !== "object") return [];
  return coordinatesOf(ring as Record<string, unknown>);
}

const KML_GEOMETRY_TAGS = ["Point", "LineString", "Polygon", "MultiGeometry"] as const;

function convertKmlGeometry(tag: string, node: unknown): Geometry | null {
  if (!node || typeof node !== "object") return null;
  const n = node as Record<string, unknown>;

  if (tag === "Point") {
    const coords = coordinatesOf(n);
    return coords.length ? { type: "Point", coordinates: coords[0] } : null;
  }

  if (tag === "LineString") {
    const coords = coordinatesOf(n);
    return coords.length ? { type: "LineString", coordinates: coords } : null;
  }

  if (tag === "Polygon") {
    const outer = ringFromBoundary(n.outerBoundaryIs);
    if (outer.length === 0) return null;
    const rings = [outer];
    for (const inner of asArray(n.innerBoundaryIs)) {
      const ring = ringFromBoundary(inner);
      if (ring.length > 0) rings.push(ring);
    }
    return { type: "Polygon", coordinates: rings };
  }

  if (tag === "MultiGeometry") {
    const subGeoms: Geometry[] = [];
    for (const childTag of KML_GEOMETRY_TAGS) {
      for (const child of asArray(n[childTag] as unknown | unknown[])) {
        const g = convertKmlGeometry(childTag, child);
        if (g) subGeoms.push(g);
      }
    }
    if (subGeoms.length === 0) return null;
    if (subGeoms.length === 1) return subGeoms[0];
    if (subGeoms.every((g) => g.type === "Polygon")) {
      return { type: "MultiPolygon", coordinates: subGeoms.map((g) => (g as Polygon).coordinates) };
    }
    return { type: "GeometryCollection", geometries: subGeoms };
  }

  return null;
}

function geometryFromPlacemark(pm: Record<string, unknown>): Geometry | null {
  for (const tag of KML_GEOMETRY_TAGS) {
    if (pm[tag] === undefined) continue;
    const node = Array.isArray(pm[tag]) ? (pm[tag] as unknown[])[0] : pm[tag];
    const g = convertKmlGeometry(tag, node);
    if (g) return g;
  }
  return null;
}

// Flattens <Data name="…"><value>…</value></Data> and schema-based <SimpleData
// name="…">…</SimpleData> into a plain name→value dict, same shape as the
// column-attribute properties GPKG/SHP features carry.
function extendedDataOf(pm: Record<string, unknown>): Record<string, string> {
  const props: Record<string, string> = {};
  const ext = pm.ExtendedData;
  if (!ext || typeof ext !== "object") return props;
  const e = ext as Record<string, unknown>;

  for (const d of asArray(e.Data as unknown | unknown[])) {
    if (!d || typeof d !== "object") continue;
    const dd = d as Record<string, unknown>;
    const key = dd["@_name"] as string | undefined;
    if (key) props[key] = textOf(dd.value);
  }
  for (const schemaData of asArray(e.SchemaData as unknown | unknown[])) {
    if (!schemaData || typeof schemaData !== "object") continue;
    for (const simple of asArray((schemaData as Record<string, unknown>).SimpleData as unknown | unknown[])) {
      if (!simple || typeof simple !== "object") continue;
      const ss = simple as Record<string, unknown>;
      const key = ss["@_name"] as string | undefined;
      if (key) props[key] = textOf(ss);
    }
  }
  return props;
}

// Recursively finds every <Placemark> at any nesting depth (Document > Folder >
// Folder > Placemark, etc.) — mirrors the `.//Placemark` XPath the Python
// client (FarmersDatabase/Client/upload_data.py) uses via ElementTree.
function collectPlacemarks(node: unknown, acc: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectPlacemarks(item, acc);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (obj.Placemark !== undefined) {
    for (const pm of asArray(obj.Placemark as unknown | unknown[])) {
      if (pm && typeof pm === "object") acc.push(pm as Record<string, unknown>);
    }
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") collectPlacemarks(value, acc);
  }
}

export async function parseKml(buffer: Buffer): Promise<FeatureCollection> {
  const { XMLParser, XMLValidator } = await import("fast-xml-parser");
  const text = buffer.toString("utf8");

  const validation = XMLValidator.validate(text);
  if (validation !== true) {
    throw new Error(`Malformed KML (line ${validation.err.line}): ${validation.err.msg}`);
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    textNodeName: "#text",
  });
  const doc = parser.parse(text);

  const placemarks: Record<string, unknown>[] = [];
  collectPlacemarks(doc, placemarks);

  const features: Feature[] = [];
  for (const pm of placemarks) {
    const geometry = geometryFromPlacemark(pm);
    if (!geometry) continue;
    const name = textOf(pm.name);
    features.push({
      type: "Feature",
      geometry,
      properties: {
        ...extendedDataOf(pm),
        ...(name ? { Name: name } : {}),
      },
    });
  }

  return { type: "FeatureCollection", features };
}

export async function parseKmz(buffer: Buffer): Promise<FeatureCollection> {
  const yauzl = (await import("yauzl")).default;
  const os = await import("os");
  const fs = await import("fs");
  const path = await import("path");

  const tmp = path.join(os.tmpdir(), `kmz_${Date.now()}.kmz`);
  fs.writeFileSync(tmp, buffer);

  try {
    const kmlBuffer = await new Promise<Buffer>((resolve, reject) => {
      yauzl.open(tmp, { lazyEntries: true }, (err, zip) => {
        if (err || !zip) return reject(err ?? new Error("Failed to open KMZ archive"));
        let found: { name: string; buf: Buffer } | null = null;
        zip.on("error", reject);
        zip.on("end", () => {
          if (found) resolve(found.buf);
          else reject(new Error("No .kml file found inside the .kmz archive"));
        });
        zip.on("entry", (entry) => {
          const isKml = !/\/$/.test(entry.fileName) && entry.fileName.toLowerCase().endsWith(".kml");
          if (!isKml) return zip.readEntry();
          zip.openReadStream(entry, (streamErr, stream) => {
            if (streamErr || !stream) return zip.readEntry();
            const chunks: Buffer[] = [];
            stream.on("data", (c: Buffer) => chunks.push(c));
            stream.on("end", () => {
              const isDocKml = path.basename(entry.fileName).toLowerCase() === "doc.kml";
              if (!found || isDocKml) found = { name: entry.fileName, buf: Buffer.concat(chunks) };
              zip.readEntry();
            });
          });
        });
        zip.readEntry();
      });
    });

    return await parseKml(kmlBuffer);
  } finally {
    fs.unlinkSync(tmp);
  }
}

// ── Coordinate reprojection ─────────────────────────────────────────────────

function loadEpsgDef(epsg: number): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const all = require("epsg-index/all.json") as Record<string, { proj4: string | null }>;
    return all[String(epsg)]?.proj4 ?? null;
  } catch {
    return null;
  }
}

type Position = number[];

function reprojectPosition(pos: Position, converter: (p: Position) => Position): Position {
  const [x, y, ...rest] = pos;
  const [lon, lat] = converter([x, y]);
  return [lon, lat, ...rest];
}

function reprojectCoordinates(
  coords: unknown,
  depth: number,
  converter: (p: Position) => Position,
): unknown {
  if (depth === 0) return reprojectPosition(coords as Position, converter);
  return (coords as unknown[]).map((c) => reprojectCoordinates(c, depth - 1, converter));
}

const GEOMETRY_DEPTHS: Record<string, number> = {
  Point: 0,
  MultiPoint: 1,
  LineString: 1,
  MultiLineString: 2,
  Polygon: 2,
  MultiPolygon: 3,
};

function reprojectGeometry(geom: Geometry, converter: (p: Position) => Position): Geometry {
  const depth = GEOMETRY_DEPTHS[geom.type];
  if (depth === undefined) return geom; // GeometryCollection — skip
  const withCoords = geom as unknown as { type: string; coordinates: unknown };
  return {
    type: withCoords.type,
    coordinates: reprojectCoordinates(withCoords.coordinates, depth, converter),
  } as unknown as Geometry;
}

// ── Normalise any GeoJSON input to a FeatureCollection ──────────────────────

function normalise(raw: GeoJSON): FeatureCollection {
  if (raw.type === "FeatureCollection") return raw as FeatureCollection;
  if (raw.type === "Feature") return { type: "FeatureCollection", features: [raw as Feature] };
  // Bare geometry
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: raw as Geometry, properties: {} }],
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function parseGeojson(buffer: Buffer): Promise<FeatureCollection> {
  const text = buffer.toString("utf8");
  return normalise(JSON.parse(text) as GeoJSON);
}

export async function parseShapefile(buffer: Buffer): Promise<FeatureCollection> {
  const { default: shp } = await import("shpjs");
  const result = await shp(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
  if (Array.isArray(result)) {
    return {
      type: "FeatureCollection",
      features: result.flatMap((fc) => (fc as FeatureCollection).features ?? []),
    };
  }
  return result as FeatureCollection;
}

export async function parseGeopackage(buffer: Buffer): Promise<FeatureCollection> {
  const Database = (await import("better-sqlite3")).default;
  const os = await import("os");
  const fs = await import("fs");
  const path = await import("path");
  const { Geometry } = await import("wkx");

  const tmp = path.join(os.tmpdir(), `gpkg_${Date.now()}.gpkg`);
  fs.writeFileSync(tmp, buffer);

  try {
    const db = new Database(tmp, { readonly: true });

    const tables = db
      .prepare("SELECT table_name, column_name FROM gpkg_geometry_columns")
      .all() as { table_name: string; column_name: string }[];

    const features: Feature[] = [];

    for (const { table_name, column_name } of tables) {
      const rows = db.prepare(`SELECT * FROM "${table_name}"`).all() as Record<string, unknown>[];
      for (const row of rows) {
        const blob = row[column_name];
        if (!Buffer.isBuffer(blob) && !(blob instanceof Uint8Array)) continue;
        const wkb = extractWkbFromGpkgBlob(Buffer.from(blob as Uint8Array));
        if (!wkb) continue;
        const geom = Geometry.parse(wkb).toGeoJSON() as Geometry;
        const props = Object.fromEntries(
          Object.entries(row).filter(([k]) => k !== column_name),
        );
        features.push({ type: "Feature", geometry: geom, properties: props });
      }
    }

    db.close();
    return { type: "FeatureCollection", features };
  } finally {
    fs.unlinkSync(tmp);
  }
}

export function applyEpsgTransform(fc: FeatureCollection, epsg: number): FeatureCollection {
  if (epsg === 4326) return fc;

  const def = loadEpsgDef(epsg);
  if (!def) throw new Error(`Unknown EPSG:${epsg} — not found in epsg-index`);

  proj4.defs(`EPSG:${epsg}`, def);
  const converter = proj4(`EPSG:${epsg}`, "WGS84").forward as (p: Position) => Position;

  return {
    ...fc,
    features: fc.features.map((f) => ({
      ...f,
      geometry: f.geometry ? reprojectGeometry(f.geometry, converter) : f.geometry,
    })),
  };
}
