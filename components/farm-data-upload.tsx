"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BasemapIntakeRegister } from "@/components/basemap-intake-register";
import { detectCoordColumns, splitCsvLine } from "@/lib/csv-points";
import { cn } from "@/lib/utils";

// Unified farm upload box (farm page Overview tab) — replaces the separate
// Field Boundaries / Basemap / Document cards. The chosen file is sniffed
// client-side (classifyUpload below); if it looks spatial the uploader is asked
// whether to display it, and with what name and CRS:
//   GeoTIFF          → POST /api/basemaps (tiled on PipelineProcessor)
//   vector, layer    → POST /api/farms/[id]/layers (Farm_Layers overlay)
//   vector, fields   → POST /api/farms/[id]/boundaries (creates Fields)
//   point CSV        → POST /api/farms/[id]/layers
// each with keep_document=1 so the original also lands in the farm's Documents.
// Anything non-spatial, or declined, goes to POST /api/farms/[id]/documents.

interface Props {
  farmId: number;
  fieldCount: number;
  drawButton?: React.ReactNode;
}

type SpatialKind = "raster" | "vector" | "csv";

interface Classified {
  kind: SpatialKind | "document";
  // Human-readable reason shown in the dialog ("GeoTIFF raster", "point CSV (lat, lon)")
  detail: string;
  // Default EPSG to pre-fill; "" for a raster means auto-detect.
  defaultEpsg: string;
  // KML/KMZ, or a loose shapefile with .prj: CRS is known, no input shown.
  crsFixed?: string;
}

type Status = "idle" | "checking" | "uploading" | "success" | "error";

// Same 100MB cap as lib/document-upload.ts MAX_DOCUMENT_BYTES — also applies to
// map layers, which are buffered server-side. Only GeoTIFFs (streamed) exceed it.
const MAX_BYTES = 100 * 1024 * 1024;
const SHP_SIDECARS = [".dbf", ".prj", ".cpg", ".shx", ".sbn", ".sbx", ".qix", ".xml"];
const EPSG_SUGGESTIONS: [string, string][] = [
  ["4326", "WGS 84 (lat/lon)"],
  ["4269", "NAD83 (lat/lon)"],
  ["32617", "WGS 84 / UTM 17N"],
  ["32618", "WGS 84 / UTM 18N"],
  ["26917", "NAD83 / UTM 17N"],
  ["26918", "NAD83 / UTM 18N"],
  ["32116", "NAD83 / New York Central"],
];

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

function baseName(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? name : name.slice(0, i);
}

async function readText(blob: Blob): Promise<string> {
  return new TextDecoder().decode(await blob.arrayBuffer());
}

async function classifyUpload(file: File, sidecars: File[]): Promise<Classified> {
  const e = ext(file.name);
  const doc: Classified = { kind: "document", detail: "", defaultEpsg: "" };

  if (e === ".tif" || e === ".tiff") {
    return { kind: "raster", detail: "GeoTIFF raster", defaultEpsg: "" };
  }
  if (e === ".kml" || e === ".kmz") {
    return { kind: "vector", detail: `${e.slice(1).toUpperCase()} vector`, defaultEpsg: "4326", crsFixed: "KML/KMZ coordinates are always WGS 84." };
  }
  if (e === ".gpkg" || e === ".geojson") {
    return { kind: "vector", detail: e === ".gpkg" ? "GeoPackage vector" : "GeoJSON vector", defaultEpsg: "4326" };
  }
  if (e === ".shp") {
    const hasPrj = sidecars.some((s) => ext(s.name) === ".prj");
    return {
      kind: "vector",
      detail: "Shapefile",
      defaultEpsg: "4326",
      crsFixed: hasPrj ? "Coordinate system read from the .prj file." : undefined,
    };
  }
  if (e === ".json") {
    // Only a GeoJSON-shaped .json is spatial; the "type" member is near the top
    // in practice, so the first 4KB is enough to tell.
    const head = await readText(file.slice(0, 4096));
    return /"type"\s*:\s*"(FeatureCollection|Feature|Point|MultiPoint|LineString|MultiLineString|Polygon|MultiPolygon|GeometryCollection)"/.test(head)
      ? { kind: "vector", detail: "GeoJSON vector", defaultEpsg: "4326" }
      : doc;
  }
  if (e === ".zip") {
    // A zipped shapefile: look for a .shp entry name in the central directory,
    // which sits at the end of the archive. The name runs straight into the next
    // record's bytes (often "PK" or "UT"), so no \b — just not a longer lowercase
    // extension.
    const tail = await readText(file.slice(Math.max(0, file.size - 1024 * 1024)));
    return /\.(shp|SHP)(?![a-z])/.test(tail) ? { kind: "vector", detail: "Zipped shapefile", defaultEpsg: "4326" } : doc;
  }
  if (e === ".csv") {
    const head = await readText(file.slice(0, 8192));
    const firstLine = head.split(/\r?\n/)[0] ?? "";
    const cols = detectCoordColumns(splitCsvLine(firstLine));
    if (!cols) return doc;
    // x/y-style names are usually projected; lat/lon-style are geographic.
    const geographic = /^(lat|lon|lng|long)/i.test(cols.yName) || /^(lat|lon|lng|long)/i.test(cols.xName);
    return { kind: "csv", detail: `Point CSV (${cols.yName}, ${cols.xName})`, defaultEpsg: geographic ? "4326" : "" };
  }
  return doc;
}

export function FarmDataUpload({ farmId, fieldCount, drawButton }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sidecars, setSidecars] = useState<File[]>([]);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  // Dialog state
  const [classified, setClassified] = useState<Classified | null>(null);
  const [vectorTarget, setVectorTarget] = useState<"layer" | "fields">("layer");
  const [layerName, setLayerName] = useState("");
  const [epsg, setEpsg] = useState("");

  function reset() {
    setFile(null);
    setSidecars([]);
    setDescription("");
    setClassified(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (files.length === 0) return;
    setStatus("idle");
    setMessage("");
    // A loose shapefile arrives as several files; the .shp is the primary and
    // everything sharing its base name rides along as sidecars.
    const shp = files.find((f) => ext(f.name) === ".shp");
    if (shp) {
      const others = files.filter((f) => f !== shp);
      const strays = others.filter((f) => baseName(f.name) !== baseName(shp.name) || !SHP_SIDECARS.includes(ext(f.name)));
      if (strays.length > 0) {
        setStatus("error");
        setMessage("Drop one file at a time — or a .shp together with its .dbf/.prj/.shx.");
        return;
      }
      setFile(shp);
      setSidecars(others);
      return;
    }
    if (files.length > 1) {
      setStatus("error");
      setMessage("Drop one file at a time — or a .shp together with its .dbf/.prj/.shx.");
      return;
    }
    setFile(files[0]);
    setSidecars([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setStatus("checking");
    let c: Classified;
    try {
      c = await classifyUpload(file, sidecars);
    } catch {
      c = { kind: "document", detail: "", defaultEpsg: "" };
    }
    if (c.kind === "document") {
      await uploadAsDocument();
      return;
    }
    setClassified(c);
    setVectorTarget("layer");
    setLayerName(baseName(file.name));
    setEpsg(c.defaultEpsg);
    setStatus("idle");
  }

  async function post(url: string, fd: FormData, successMsg: string) {
    setStatus("uploading");
    setMessage("");
    try {
      const res = await fetch(url, { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMessage(json.error ?? "Upload failed");
        toast.error(json.error ?? "Upload failed");
        return;
      }
      setStatus("success");
      setMessage(successMsg.replace("{count}", String(json.count ?? "")));
      toast.success(successMsg.replace("{count}", String(json.count ?? "")));
      reset();
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("Network error — try again");
    }
  }

  async function uploadAsDocument() {
    if (!file) return;
    setClassified(null);
    const all = [file, ...sidecars];
    if (all.some((f) => f.size > MAX_BYTES)) {
      setStatus("error");
      setMessage(`Documents are limited to 100MB — "${file.name}" is too large`);
      return;
    }
    // A loose shapefile declined for display is saved part by part.
    for (const [i, f] of all.entries()) {
      const fd = new FormData();
      fd.append("file", f);
      if (description.trim()) fd.append("description", description.trim());
      if (i < all.length - 1) {
        const res = await fetch(`/api/farms/${farmId}/documents`, { method: "POST", body: fd }).catch(() => null);
        if (!res?.ok) {
          setStatus("error");
          setMessage(`Failed to upload "${f.name}"`);
          return;
        }
      } else {
        await post(`/api/farms/${farmId}/documents`, fd, `Saved "${file.name}" to Documents`);
      }
    }
  }

  async function uploadForDisplay() {
    if (!file || !classified) return;
    const c = classified;
    setClassified(null);

    const fd = new FormData();
    fd.append("file", file);
    sidecars.forEach((s) => fd.append("sidecar", s));
    fd.append("keep_document", "1");
    if (description.trim()) fd.append("description", description.trim());

    if (c.kind === "raster") {
      fd.append("farm_id", String(farmId));
      if (layerName.trim()) fd.append("display_name", layerName.trim());
      if (epsg.trim()) fd.append("crs_override_epsg", epsg.trim());
      await post("/api/basemaps", fd, `Uploaded "${layerName || file.name}" — it's listed under the map while it tiles, and gets a checkbox once ready.`);
      return;
    }

    if ([file, ...sidecars].some((f) => f.size > MAX_BYTES)) {
      setStatus("error");
      setMessage("Vector and CSV layers are limited to 100MB");
      return;
    }
    fd.append("epsg", epsg.trim() || "4326");
    if (c.kind === "vector" && vectorTarget === "fields") {
      await post(`/api/farms/${farmId}/boundaries`, fd, "Added {count} field(s)");
    } else {
      fd.append("name", layerName.trim() || baseName(file.name));
      await post(`/api/farms/${farmId}/layers`, fd, `Added layer "${layerName || file.name}" ({count} features)`);
    }
  }

  const busy = status === "checking" || status === "uploading";
  const isRaster = classified?.kind === "raster";
  const showName = classified != null && !(classified.kind === "vector" && vectorTarget === "fields");
  const epsgMissing = classified != null && !classified.crsFixed && !isRaster && epsg.trim() === "";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Upload Data</CardTitle>
        <div className="flex items-center gap-2">
          {drawButton}
          <Badge variant="secondary">{fieldCount} field{fieldCount === 1 ? "" : "s"}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            className={cn(
              "border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer transition-colors",
              dragging ? "border-blue-500 bg-blue-50" : "border-stone-200 hover:border-stone-400",
              file ? "bg-stone-50" : "",
            )}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
              }}
            />
            {file ? (
              <div>
                <p className="text-sm font-medium text-stone-700">{file.name}</p>
                {sidecars.length > 0 && (
                  <p className="text-xs text-stone-400 mt-1">+ {sidecars.map((s) => ext(s.name)).join(", ")}</p>
                )}
              </div>
            ) : (
              <div>
                <p className="text-sm text-stone-500">Drop a file here or click to browse</p>
                <p className="text-xs text-stone-400 mt-1">
                  Spatial data (GeoTIFF, GeoPackage, shapefile, KML/KMZ, GeoJSON, CSV with lat/lon or x/y) can be shown on the map — anything else is saved to Documents.
                </p>
              </div>
            )}
          </div>

          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full rounded-md border border-stone-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {status === "success" && <p className="text-sm text-green-600 font-medium">{message}</p>}
          {status === "error" && <p className="text-sm text-red-600">{message}</p>}

          <button
            type="submit"
            disabled={!file || busy}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              !file || busy ? "bg-stone-100 text-stone-400 cursor-not-allowed" : "bg-stone-900 text-white hover:bg-stone-700",
            )}
          >
            {busy && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {status === "checking" ? "Checking…" : status === "uploading" ? "Uploading…" : "Upload"}
          </button>
        </form>

        <BasemapIntakeRegister farmId={farmId} onRegistered={() => router.refresh()} />
      </CardContent>

      <Dialog open={classified != null} onOpenChange={(open) => { if (!open) { setClassified(null); setStatus("idle"); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Do you want to display this data?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-stone-700">{file?.name}</span> looks like spatial data
              {classified ? ` (${classified.detail})` : ""}. Either way, the original file is saved to Documents.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {classified?.kind === "vector" && (
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium text-stone-700 mb-1">Show as</legend>
                <label className="flex items-start gap-2 text-sm">
                  <input type="radio" name="vector-target" className="mt-0.5" checked={vectorTarget === "layer"} onChange={() => setVectorTarget("layer")} />
                  <span>Map layer <span className="text-stone-400">— a display-only overlay</span></span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="radio" name="vector-target" className="mt-0.5" checked={vectorTarget === "fields"} onChange={() => setVectorTarget("fields")} />
                  <span>Field boundaries <span className="text-stone-400">— creates a field per polygon</span></span>
                </label>
              </fieldset>
            )}

            {showName && (
              <label className="block space-y-1">
                <span className="text-sm font-medium text-stone-700">Layer name</span>
                <input
                  type="text"
                  value={layerName}
                  onChange={(e) => setLayerName(e.target.value)}
                  className="w-full rounded-md border border-stone-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            )}

            {classified?.crsFixed ? (
              <p className="text-xs text-stone-500">{classified.crsFixed}</p>
            ) : (
              <label className="block space-y-1">
                <span className="text-sm font-medium text-stone-700">Coordinate system (EPSG)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  list="farm-upload-epsg"
                  value={epsg}
                  onChange={(e) => setEpsg(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder={isRaster ? "Auto-detect" : "e.g. 4326"}
                  className="w-40 rounded-md border border-stone-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <datalist id="farm-upload-epsg">
                  {EPSG_SUGGESTIONS.map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </datalist>
                <span className="block text-xs text-stone-400">
                  {isRaster
                    ? "Leave blank to use the file's own CRS (checked against the farm's location). Set it only if the file's CRS is missing or wrong."
                    : classified?.kind === "csv" && classified.defaultEpsg === ""
                      ? "x/y columns are usually projected — enter the EPSG code they're in (e.g. 32618 for UTM 18N)."
                      : classified?.detail === "Zipped shapefile"
                        ? "Reprojected to WGS 84 for display. A zip that includes a .prj is reprojected automatically — leave at 4326."
                        : "Reprojected to WGS 84 for display."}
                </span>
              </label>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={uploadAsDocument}>No, just save to Documents</Button>
            <Button onClick={uploadForDisplay} disabled={epsgMissing}>Display on map</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
