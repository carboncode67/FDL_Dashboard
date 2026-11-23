"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X } from "lucide-react";
import dynamic from "next/dynamic";
import { scaleParams } from "@/lib/vision-scale";

const VisionLabelChecker = dynamic(() => import("@/components/vision-label-checker"), { ssr: false });

// Machine vision on a workflow Task (GitHub issue #4, lib/vision.ts). Phase 2:
// set up classes and sources, import field GPS points as labels on an ortho,
// run DINOv3 + kNN/logreg on PipelineProcessor and see the results. Clicking
// labels onto photos/orthos (phase 1's tagging view) and reviewing
// predictions (phase 3) come next.

export interface VisionPanelData {
  job: {
    id: number;
    mode: string;
    status: string;
    settings: Record<string, unknown>;
    classes: { id: number; name: string; color: string; is_background: boolean; label_count: number }[];
    sources: {
      id: number; kind: string; name: string; label_count: number; basemap_id: number | null; farm_id: number | null;
      checked_count: number; rejected_count: number;
      tiles: { url: string; min_zoom: number | null; max_zoom: number | null; footprint: GeoJSON.Polygon | null } | null;
      meta: Record<string, unknown> | null;
    }[];
    runs: {
      id: number; status: string; created_at: string; finished_at: string | null; label_count: number;
      prediction_count: number | null; error_message: string | null; params: Record<string, unknown>;
      metrics: Record<string, unknown> | null; layer_farm_id: number | null;
    }[];
  } | null;
  basemaps: { id: number; name: string; farm_name: string }[];
  linkedPhotoCount: number;
  processingConfigured: boolean;
}

const selectCls = "h-8 rounded-md border border-stone-200 bg-white px-2 text-sm";

async function send(url: string, init: RequestInit): Promise<string | null> {
  try {
    const res = await fetch(url, init);
    if (res.ok) return null;
    const body = await res.json().catch(() => ({}));
    return body.error ?? body.error_message ?? `Request failed (${res.status})`;
  } catch {
    return "Network error";
  }
}

export function VisionPanel({ taskId, data, canEdit }: { taskId: number; data: VisionPanelData; canEdit: boolean }) {
  const router = useRouter();
  const { job } = data;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = job?.runs.some((r) => r.status === "pending" || r.status === "running") ?? false;

  // Poll while a run is in flight.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [active, router]);

  async function act(fn: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    const err = await fn();
    setBusy(false);
    if (err) setError(err);
    else router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Machine vision</CardTitle>
        {job && <Badge variant="outline">{job.mode} · {job.status}</Badge>}
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {!data.processingConfigured && (
          <p className="text-amber-700">No processing machine is configured (PROCESSING_URL), so runs can&apos;t start.</p>
        )}
        {error && <p className="text-red-600">{error}</p>}
        {!job ? (
          <SetupForm taskId={taskId} canEdit={canEdit} busy={busy} act={act} />
        ) : (
          <>
            <ClassesSection job={job} canEdit={canEdit} busy={busy} act={act} />
            <SourcesSection job={job} data={data} canEdit={canEdit} busy={busy} act={act} />
            <ImportSection job={job} canEdit={canEdit} busy={busy} act={act} />
            <ScaleSection key={String(job.settings.object_size_m ?? "")} job={job} canEdit={canEdit} busy={busy} act={act} />
            <RunSection job={job} canEdit={canEdit && data.processingConfigured} busy={busy || active} act={act} />
            <RunsList job={job} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

type Act = (fn: () => Promise<string | null>) => Promise<void>;
type Job = NonNullable<VisionPanelData["job"]>;

function SetupForm({ taskId, canEdit, busy, act }: { taskId: number; canEdit: boolean; busy: boolean; act: Act }) {
  const [mode, setMode] = useState("detection");
  const [classes, setClasses] = useState("");
  if (!canEdit) return <p className="text-stone-500">No vision job set up for this task yet.</p>;
  return (
    <div className="space-y-3">
      <p className="text-stone-600">
        Find objects in this task&apos;s photos or in a drone ortho: label a few examples of each class plus some
        background, and DINOv3 features + a light model find the rest.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs text-stone-500">Task type</span>
          <select className={selectCls} value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="detection">Detection</option>
            <option value="segmentation">Segmentation</option>
          </select>
        </label>
        <label className="flex-1 min-w-48 space-y-1">
          <span className="block text-xs text-stone-500">Classes to find (comma-separated)</span>
          <Input value={classes} onChange={(e) => setClasses(e.target.value)} placeholder="e.g. weed, cow" />
        </label>
        <Button size="sm" disabled={busy || !classes.trim()}
          onClick={() => act(() => send(`/api/tasks/${taskId}/vision`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode, classes: classes.split(",") }),
          }))}>
          Set up
        </Button>
      </div>
    </div>
  );
}

function ClassesSection({ job, canEdit, busy, act }: { job: Job; canEdit: boolean; busy: boolean; act: Act }) {
  const [add, setAdd] = useState("");
  return (
    <section className="space-y-2">
      <h3 className="font-medium text-stone-800">Classes</h3>
      <div className="flex flex-wrap gap-2">
        {job.classes.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 px-2.5 py-0.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
            {c.name}
            <span className="text-stone-400">{c.label_count}</span>
            {canEdit && !c.is_background && (
              <button aria-label={`Remove ${c.name}`} className="text-stone-400 hover:text-red-600" disabled={busy}
                onClick={() => {
                  if (c.label_count && !window.confirm(`Delete "${c.name}" and its ${c.label_count} labels?`)) return;
                  act(() => send(`/api/vision/${job.id}`, {
                    method: "PATCH", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ remove_class_ids: [c.id] }),
                  }));
                }}>
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      {canEdit && (
        <div className="flex gap-2 max-w-sm">
          <Input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add a class" className="h-8" />
          <Button size="sm" variant="outline" disabled={busy || !add.trim()}
            onClick={() => act(async () => {
              const err = await send(`/api/vision/${job.id}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ add_classes: add.split(",") }),
              });
              if (!err) setAdd("");
              return err;
            })}>
            Add
          </Button>
        </div>
      )}
    </section>
  );
}

function SourcesSection({ job, data, canEdit, busy, act }: { job: Job; data: VisionPanelData; canEdit: boolean; busy: boolean; act: Act }) {
  const chosen = useMemo(() => new Set(job.sources.filter((s) => s.basemap_id != null).map((s) => s.basemap_id!)), [job.sources]);
  const photos = job.sources.filter((s) => s.kind === "photo");
  const router = useRouter();
  const [checking, setChecking] = useState<number | null>(null);
  const checkSrc = job.sources.find((s) => s.id === checking);
  return (
    <section className="space-y-2">
      {checkSrc?.tiles && (
        <VisionLabelChecker
          jobId={job.id} sourceId={checkSrc.id} sourceName={checkSrc.name} tiles={checkSrc.tiles}
          classes={job.classes} canEdit={canEdit}
          objectSize={typeof job.settings.object_size_m === "number" ? job.settings.object_size_m : null}
          onClose={() => { setChecking(null); router.refresh(); }}
        />
      )}
      <h3 className="font-medium text-stone-800">Images</h3>
      <p className="text-stone-600">
        {photos.length} photo{photos.length !== 1 ? "s" : ""} from this task&apos;s linked files
        {data.linkedPhotoCount !== photos.length && " (re-synced on the next change or run)"}
        {photos.length > 0 && ` · ${photos.reduce((n, s) => n + s.label_count, 0)} labels`}
      </p>
      {data.basemaps.length === 0 ? (
        <p className="text-stone-500">No finished basemaps (orthos) on this task&apos;s farm.</p>
      ) : (
        <div className="space-y-1">
          <span className="text-xs text-stone-500">Orthos (basemaps)</span>
          {data.basemaps.map((b) => {
            const src = job.sources.find((s) => s.basemap_id === b.id);
            const on = chosen.has(b.id);
            return (
              <label key={b.id} className="flex items-center gap-2">
                <input type="checkbox" checked={on} disabled={!canEdit || busy || (on && (src?.label_count ?? 0) > 0)}
                  onChange={() => {
                    const next = new Set(chosen);
                    if (on) next.delete(b.id);
                    else next.add(b.id);
                    act(() => send(`/api/vision/${job.id}`, {
                      method: "PATCH", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ basemap_ids: Array.from(next) }),
                    }));
                  }} />
                <span>{b.name}</span>
                <span className="text-stone-400">{b.farm_name}</span>
                {src && <span className="text-stone-500">· {src.label_count} labels</span>}
                {src && src.label_count + src.rejected_count > 0 && (
                  <span className="text-stone-400">
                    · {src.checked_count} checked{src.rejected_count ? `, ${src.rejected_count} rejected` : ""}
                  </span>
                )}
                {src?.tiles && src.label_count + src.rejected_count > 0 && (
                  <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={(e) => { e.preventDefault(); setChecking(src.id); }}>
                    Check labels
                  </Button>
                )}
                {src?.meta?.gsd_m != null && <span className="text-stone-400">· embedded at {(Number(src.meta.gsd_m) * 100).toFixed(1)} cm/px</span>}
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ScaleSection({ job, canEdit, busy, act }: { job: Job; canEdit: boolean; busy: boolean; act: Act }) {
  const saved = typeof job.settings.object_size_m === "number" ? job.settings.object_size_m : null;
  const [size, setSize] = useState(saved != null ? String(saved) : "");
  if (!job.sources.some((s) => s.kind === "basemap")) return null;
  const sizeM = Number(size) > 0 ? Number(size) : null;
  const sc = scaleParams(sizeM);
  const save = () => {
    if ((sizeM ?? null) === saved) return;
    act(() => send(`/api/vision/${job.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object_size_m: sizeM }),
    }));
  };
  return (
    <section className="space-y-2">
      <h3 className="font-medium text-stone-800">Object scale</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs text-stone-500">Rough object size on the orthos (m across)</span>
          <Input className="h-8 w-28" type="number" min={0.02} max={200} step={0.05} value={size} disabled={!canEdit || busy}
            placeholder="e.g. 0.3" onChange={(e) => setSize(e.target.value)} onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        </label>
        <p className="max-w-md text-xs text-stone-500">
          {sizeM
            ? <>Orthos are embedded at ≈{((sc.gsd_m ?? 0) * 100).toFixed(1)} cm/px (native if the ortho is coarser), and each point label trains on a ~{(sc.point_radius_m * 2).toFixed(2)} m disc around it. Changing this re-embeds the ortho on the next run.</>
            : <>e.g. weed seedling 0.1, thistle 0.4, cow 2, tree crown 8. Without it, orthos are used at native resolution and each point covers one patch. You can also size it by eye in &quot;Check labels&quot;.</>}
        </p>
      </div>
    </section>
  );
}

type LabelPreview = {
  features: number; points: number; polygons: number; skipped: number; outside: number;
  epsg: number; epsgDetected: boolean;
  columns: { name: string; distinct: number; values: { value: string; count: number }[] }[];
};

const LABEL_ACCEPT = ".csv,.geojson,.json,.zip,.shp,.dbf,.prj,.cpg,.shx,.gpkg,.kml,.kmz";
const LIKELY_LABEL_COLUMNS = ["class", "label", "category", "type", "cls", "species", "name"];
const NO_BG = "\u0000none"; // select value: the file has no background value

function guessLabelColumn(p: LabelPreview): string {
  const usable = p.columns.filter((c) => c.distinct >= 2 && c.distinct <= 21);
  for (const want of LIKELY_LABEL_COLUMNS) {
    const hit = usable.find((c) => c.name.toLowerCase() === want);
    if (hit) return hit.name;
  }
  return "";
}

function ImportSection({ job, canEdit, busy, act }: { job: Job; canEdit: boolean; busy: boolean; act: Act }) {
  const orthos = job.sources.filter((s) => s.kind === "basemap");
  const [sourceId, setSourceId] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [epsg, setEpsg] = useState("");
  const [preview, setPreview] = useState<LabelPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [column, setColumn] = useState("");
  const [bgValue, setBgValue] = useState(NO_BG);
  const [defaultClass, setDefaultClass] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const sid = sourceId || String(orthos[0]?.id ?? "");
  const col = preview?.columns.find((c) => c.name === column) ?? null;

  const formFor = (mode: "preview" | "import") => {
    const fd = new FormData();
    for (const f of files) fd.append("file", f);
    fd.set("source_id", sid);
    if (epsg.trim()) fd.set("epsg", epsg.trim());
    fd.set("mode", mode);
    return fd;
  };

  async function readFile(nextFiles = files, nextSid = sid, nextEpsg = epsg) {
    setPreview(null);
    setPreviewError(null);
    setResult(null);
    if (nextFiles.length === 0) return;
    setReading(true);
    const fd = new FormData();
    for (const f of nextFiles) fd.append("file", f);
    fd.set("source_id", nextSid);
    if (nextEpsg.trim()) fd.set("epsg", nextEpsg.trim());
    fd.set("mode", "preview");
    try {
      const res = await fetch(`/api/vision/${job.id}/labels/import`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPreviewError(body.error ?? `Couldn't read the file (${res.status})`);
        return;
      }
      const p = body as LabelPreview;
      setPreview(p);
      const guess = guessLabelColumn(p);
      setColumn(guess);
      const vals = p.columns.find((c) => c.name === guess)?.values ?? [];
      // Pre-pick an obvious negative value; the user confirms it.
      const neg = vals.find((v) => /^(background|bg|none|null|no|negative|neg|0|false|other|soil)$/i.test(v.value));
      setBgValue(neg ? neg.value : NO_BG);
    } catch {
      setPreviewError("Network error");
    } finally {
      setReading(false);
    }
  }

  if (!canEdit || orthos.length === 0) return null;
  const known = new Map(job.classes.map((c) => [c.name.toLowerCase(), c]));
  const mapping = col
    ? col.values.map((v) => {
        if (bgValue !== NO_BG && v.value.toLowerCase() === bgValue.toLowerCase()) return { ...v, to: "background", kind: "bg" as const };
        if (v.value === "") return { ...v, to: "skipped (empty)", kind: "skip" as const };
        const k = known.get(v.value.toLowerCase());
        return k ? { ...v, to: k.is_background ? "background" : k.name, kind: (k.is_background ? "bg" : "class") as "bg" | "class" }
          : { ...v, to: `new class "${v.value}"`, kind: "new" as const };
      })
    : [];
  const hasBackground = mapping.some((m) => m.kind === "bg");
  const canImport = !!preview && preview.features > 0 && (column ? true : !!defaultClass);

  return (
    <section className="space-y-2">
      <h3 className="font-medium text-stone-800">Import training labels from a file</h3>
      <p className="text-stone-500 text-xs">
        Field GPS points or digitised polygons: CSV (lat/lon columns), GeoJSON, shapefile (.zip, or .shp with its
        .dbf/.prj), GeoPackage, or KML/KMZ. Pick the column holding the labels and the value that means
        &quot;not an object&quot; (background); every other value becomes a class of that name.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="block text-xs text-stone-500">Ortho</span>
          <select className={selectCls} value={sid} onChange={(e) => { setSourceId(e.target.value); void readFile(files, e.target.value); }}>
            {orthos.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-stone-500">File(s)</span>
          <input type="file" multiple accept={LABEL_ACCEPT} className="text-xs"
            onChange={(e) => { const fs = Array.from(e.target.files ?? []); setFiles(fs); void readFile(fs); }} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-stone-500">EPSG (if not lon/lat)</span>
          <Input className="h-8 w-28" inputMode="numeric" placeholder={preview?.epsgDetected ? String(preview.epsg) : "auto"} value={epsg}
            onChange={(e) => setEpsg(e.target.value.replace(/\D/g, ""))}
            onBlur={() => { if (files.length) void readFile(files, sid, epsg); }} />
        </label>
      </div>
      {reading && <p className="text-stone-500 text-xs">Reading file…</p>}
      {previewError && <p className="text-red-600 text-xs">{previewError}</p>}

      {preview && (
        <div className="space-y-2 rounded-md border border-stone-200 p-3">
          <p className="text-xs text-stone-600">
            {preview.features} labels ({preview.points} points, {preview.polygons} polygons)
            {preview.outside > 0 && <span className="text-amber-700"> · {preview.outside} outside this ortho, will be skipped</span>}
            {preview.skipped > 0 && <> · {preview.skipped} unusable (lines, empty or oversized shapes)</>}
            {" "}· read as EPSG:{preview.epsg}{preview.epsgDetected ? " (from the file)" : ""}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1">
              <span className="block text-xs text-stone-500">Label column</span>
              <select className={selectCls} value={column}
                onChange={(e) => { setColumn(e.target.value); setBgValue(NO_BG); }}>
                <option value="">(one class for the whole file)</option>
                {preview.columns.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.distinct} values)</option>)}
              </select>
            </label>
            {col ? (
              <label className="space-y-1">
                <span className="block text-xs text-stone-500">Background (negative) value</span>
                <select className={selectCls} value={bgValue} onChange={(e) => setBgValue(e.target.value)}>
                  <option value={NO_BG}>(none in this file)</option>
                  {col.values.map((v) => (
                    <option key={v.value} value={v.value}>{v.value === "" ? "(empty)" : v.value} · {v.count}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="space-y-1">
                <span className="block text-xs text-stone-500">Class</span>
                <select className={selectCls} value={defaultClass} onChange={(e) => setDefaultClass(e.target.value)}>
                  <option value="">Pick a class…</option>
                  {job.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            <Button size="sm" variant="outline" disabled={busy || reading || !canImport}
              onClick={() => act(async () => {
                const fd = formFor("import");
                if (column) {
                  fd.set("class_column", column);
                  if (bgValue !== NO_BG) fd.set("background_value", bgValue);
                } else fd.set("default_class_id", defaultClass);
                try {
                  const res = await fetch(`/api/vision/${job.id}/labels/import`, { method: "POST", body: fd });
                  const body = await res.json().catch(() => ({}));
                  if (!res.ok) return body.error ?? `Import failed (${res.status})`;
                  const extra = [
                    body.createdClasses?.length ? `new classes: ${body.createdClasses.join(", ")}` : "",
                    body.outside ? `${body.outside} outside the ortho` : "",
                    body.emptyValues ? `${body.emptyValues} with no label` : "",
                    body.skipped ? `${body.skipped} unusable` : "",
                  ].filter(Boolean);
                  setResult(`Imported ${body.imported} labels${extra.length ? ` (${extra.join("; ")})` : ""}`);
                  return null;
                } catch {
                  return "Network error";
                }
              })}>
              Import
            </Button>
          </div>
          {col && (
            <div className="text-xs text-stone-600">
              <ul className="grid gap-x-4 sm:grid-cols-2">
                {mapping.map((m) => (
                  <li key={m.value} className="truncate">
                    <span className="font-mono">{m.value === "" ? "(empty)" : m.value}</span> × {m.count} →{" "}
                    <span className={m.kind === "bg" ? "text-stone-500" : m.kind === "new" ? "text-blue-700" : m.kind === "skip" ? "text-stone-400" : "text-stone-800"}>{m.to}</span>
                  </li>
                ))}
              </ul>
              {col.distinct > col.values.length && <p className="text-stone-500">…and {col.distinct - col.values.length} more values.</p>}
              {!hasBackground && <p className="text-amber-700">No background in this file. A run needs background labels, so import some separately or pick the negative value.</p>}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {result && <p className="text-stone-600">{result}</p>}
        <Button size="sm" variant="ghost" disabled={busy}
          onClick={() => {
            if (!window.confirm("Remove every imported label on this ortho?")) return;
            act(() => send(`/api/vision/${job.id}/labels?source_id=${sid}&origin=gps_import`, { method: "DELETE" }));
          }}>
          Clear imported
        </Button>
      </div>
    </section>
  );
}

function RunSection({ job, canEdit, busy, act }: { job: Job; canEdit: boolean; busy: boolean; act: Act }) {
  const s = job.settings;
  const [head, setHead] = useState(String(s.head ?? "knn"));
  const [k, setK] = useState(String(s.k ?? 10));
  const [threshold, setThreshold] = useState(String(s.threshold ?? 0.5));
  const [gsdCm, setGsdCm] = useState(s.gsd_m ? String(Number(s.gsd_m) * 100) : "");
  if (!canEdit) return null;
  const hasOrtho = job.sources.some((x) => x.kind === "basemap");
  const bg = job.classes.find((c) => c.is_background);
  const blocker = job.sources.length === 0 ? "Add photos or an ortho first."
    : !bg?.label_count ? "Label some background first."
    : !job.classes.some((c) => !c.is_background && c.label_count) ? "Label at least one object."
    : null;
  return (
    <section className="space-y-2">
      <h3 className="font-medium text-stone-800">Run</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs text-stone-500">Model</span>
          <select className={selectCls} value={head} onChange={(e) => setHead(e.target.value)}>
            <option value="knn">kNN</option>
            <option value="logreg">Logistic regression</option>
          </select>
        </label>
        {head === "knn" && (
          <label className="space-y-1">
            <span className="block text-xs text-stone-500">Neighbours (k)</span>
            <Input className="h-8 w-20" type="number" min={1} max={100} value={k} onChange={(e) => setK(e.target.value)} />
          </label>
        )}
        <label className="space-y-1">
          <span className="block text-xs text-stone-500">Min. confidence</span>
          <Input className="h-8 w-20" type="number" step={0.05} min={0.05} max={0.99} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </label>
        {hasOrtho && (
          <label className="space-y-1">
            <span className="block text-xs text-stone-500">Ortho resolution override (cm/px)</span>
            <Input className="h-8 w-28" type="number" step={0.5} min={0.1} value={gsdCm} placeholder="from object size" onChange={(e) => setGsdCm(e.target.value)} />
          </label>
        )}
        <Button size="sm" disabled={busy || blocker != null}
          onClick={() => act(() => send(`/api/vision/${job.id}/runs`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ head, k: Number(k), threshold: Number(threshold), gsd_m: gsdCm ? Number(gsdCm) / 100 : null }),
          }))}>
          {job.runs.length ? "Train and run" : "Run"}
        </Button>
      </div>
      {blocker && <p className="text-xs text-stone-500">{blocker}</p>}
      {hasOrtho && <p className="text-xs text-stone-400">The first run on an ortho embeds it on the GPU (about a minute per GB); later runs reuse that and take seconds.</p>}
    </section>
  );
}

function RunsList({ job }: { job: Job }) {
  if (job.runs.length === 0) return null;
  const className = new Map(job.classes.map((c) => [String(c.id), c.name]));
  const fmt = (iso: string) => new Date(iso).toLocaleString();
  return (
    <section className="space-y-2">
      <h3 className="font-medium text-stone-800">Runs</h3>
      <ul className="space-y-2">
        {job.runs.map((r) => {
          const m = r.metrics ?? {};
          const acc = (m.loo_accuracy ?? m.cv_accuracy) as Record<string, number> | undefined;
          return (
            <li key={r.id} className="rounded-md border border-stone-200 p-2.5 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Run {r.id}</span>
                <Badge variant={r.status === "failed" ? "destructive" : r.status === "ready" ? "default" : "secondary"}>{r.status}</Badge>
                <span className="text-stone-500">{fmt(r.created_at)}</span>
                <span className="text-stone-500">· {String(r.params.head ?? "knn")} · {r.label_count} labels</span>
                {r.prediction_count != null && <span className="text-stone-700">· {r.prediction_count} predictions</span>}
              </div>
              {r.error_message && <p className="text-red-600">{r.error_message}</p>}
              {acc && (
                <p className="text-stone-600">
                  {m.loo_accuracy ? "Leave-one-out" : "Cross-validated"} accuracy on labels:{" "}
                  {Object.entries(acc).map(([cid, v]) => `${className.get(cid) ?? cid} ${Math.round(v * 100)}%`).join(", ")}
                </p>
              )}
              {r.status === "ready" && (
                <div className="flex gap-3">
                  <a className="text-blue-600 hover:underline" href={`/api/vision/runs/${r.id}/predictions`}>Download GeoJSON</a>
                  {r.layer_farm_id && <Link className="text-blue-600 hover:underline" href={`/farms/${r.layer_farm_id}`}>View on farm map</Link>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
