"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X } from "lucide-react";

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
    sources: { id: number; kind: string; name: string; label_count: number; basemap_id: number | null; farm_id: number | null; meta: Record<string, unknown> | null }[];
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
  return (
    <section className="space-y-2">
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
                {src?.meta?.gsd_m != null && <span className="text-stone-400">· embedded at {(Number(src.meta.gsd_m) * 100).toFixed(1)} cm/px</span>}
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ImportSection({ job, canEdit, busy, act }: { job: Job; canEdit: boolean; busy: boolean; act: Act }) {
  const orthos = job.sources.filter((s) => s.kind === "basemap");
  const [sourceId, setSourceId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [classColumn, setClassColumn] = useState("");
  const [defaultClass, setDefaultClass] = useState("");
  const [result, setResult] = useState<string | null>(null);
  if (!canEdit || orthos.length === 0) return null;
  const sid = sourceId || String(orthos[0].id);
  return (
    <section className="space-y-2">
      <h3 className="font-medium text-stone-800">Import field GPS points as labels</h3>
      <p className="text-stone-500 text-xs">
        GeoJSON points or a CSV with lat/lon columns (WGS84). The class comes from a column whose values match the class
        names (include &quot;background&quot; points too), or from one class for the whole file.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <select className={selectCls} value={sid} onChange={(e) => setSourceId(e.target.value)}>
          {orthos.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input type="file" accept=".geojson,.json,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs" />
        <Input className="h-8 w-36" placeholder="Class column" value={classColumn} onChange={(e) => setClassColumn(e.target.value)} />
        <select className={selectCls} value={defaultClass} onChange={(e) => setDefaultClass(e.target.value)}>
          <option value="">(no default class)</option>
          {job.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Button size="sm" variant="outline" disabled={busy || !file || (!classColumn.trim() && !defaultClass)}
          onClick={() => act(async () => {
            const fd = new FormData();
            fd.set("file", file!);
            fd.set("source_id", sid);
            if (classColumn.trim()) fd.set("class_column", classColumn.trim());
            if (defaultClass) fd.set("default_class_id", defaultClass);
            try {
              const res = await fetch(`/api/vision/${job.id}/labels/import`, { method: "POST", body: fd });
              const body = await res.json().catch(() => ({}));
              if (!res.ok) return body.error ?? `Import failed (${res.status})`;
              setResult(`Imported ${body.imported} points${body.skipped ? `, skipped ${body.skipped}` : ""}` +
                (body.unknownClasses?.length ? ` — unknown classes: ${body.unknownClasses.join(", ")}` : ""));
              return null;
            } catch {
              return "Network error";
            }
          })}>
          Import
        </Button>
        <Button size="sm" variant="ghost" disabled={busy}
          onClick={() => {
            if (!window.confirm("Remove every GPS-imported label on this ortho?")) return;
            act(() => send(`/api/vision/${job.id}/labels?source_id=${sid}&origin=gps_import`, { method: "DELETE" }));
          }}>
          Clear imported
        </Button>
      </div>
      {result && <p className="text-stone-600">{result}</p>}
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
            <span className="block text-xs text-stone-500">Ortho resolution (cm/px, blank = native)</span>
            <Input className="h-8 w-28" type="number" step={0.5} min={0.1} value={gsdCm} onChange={(e) => setGsdCm(e.target.value)} />
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
