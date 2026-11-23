"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CatalogPipeline, PipelineCatalog } from "@/lib/processing";
import { INPUT_KINDS, OUTPUT_KINDS } from "@/lib/pipeline-kinds";
import { TriggerRules, type TriggerRow } from "./trigger-rules";

type Run = {
  id: number; key: string; name: string; version: number | null; status: string;
  farm_id: number | null; farm_name: string | null; error_message: string | null;
  steps: { id: string; op: string; status: string; seconds?: number; error?: string; notes?: string[] }[];
  outputs: { name: string; kind: string; farm_layer_id?: number; basemap_id?: number; document_id?: number; error?: string }[];
  created_at: string;
  trigger: string | null;
};
type Options = { documents: { id: number; label: string }[]; basemaps: { id: number; label: string }[]; fields: number; context: number };

const selectCls = "h-9 rounded-md border border-stone-200 bg-white px-2 text-sm";
const DOC_KINDS = new Set(["yield_card", "document", "upload"]);
const STATUS_TONE: Record<string, string> = {
  ready: "border-green-300 text-green-800", partial: "border-amber-300 text-amber-800",
  failed: "border-red-300 text-red-700", running: "border-blue-300 text-blue-800", pending: "",
};

const kindLabel = (k: string) => (INPUT_KINDS as Record<string, { label: string }>)[k]?.label ?? (OUTPUT_KINDS as Record<string, string>)[k] ?? k;

function RunForm({ p, farms, onDone }: { p: CatalogPipeline; farms: { id: number; name: string }[]; onDone: () => void }) {
  const [farmId, setFarmId] = useState("");
  const [opts, setOpts] = useState<Options | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [skipAuto, setSkipAuto] = useState<Record<string, boolean>>({});
  const [params, setParams] = useState<Record<string, string>>(() =>
    Object.fromEntries(p.params.map((x) => [x.name, x.default == null ? "" : String(x.default)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!farmId) return;
    let live = true;
    fetch(`/api/pipeline-runs-v2/options?farm_id=${farmId}`)
      .then((r) => r.json())
      .then((b) => { if (live) setOpts(b as Options); })
      .catch(() => { if (live) setError("Couldn't load the farm's files"); });
    return () => { live = false; };
  }, [farmId]);

  async function start() {
    setBusy(true);
    setError(null);
    const inputs: Record<string, unknown> = {};
    for (const i of p.inputs) {
      if (DOC_KINDS.has(i.kind)) inputs[i.name] = choices[i.name] ? { document_id: Number(choices[i.name]) } : null;
      else if (i.kind === "basemap") inputs[i.name] = choices[i.name] ? { basemap_id: Number(choices[i.name]) } : null;
      else inputs[i.name] = { auto: !skipAuto[i.name] };
    }
    try {
      const res = await fetch("/api/pipeline-runs-v2", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farm_id: Number(farmId), key: p.key, inputs, params }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setError(b.error ?? `Failed (${res.status})`); return; }
      if (b.status === "failed") { setError(b.error_message ?? "The processing machine refused the run"); return; }
      onDone();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
      <label className="space-y-1">
        <span className="block text-xs text-stone-500">Farm</span>
        <select className={selectCls} value={farmId} onChange={(e) => { setFarmId(e.target.value); setOpts(null); setChoices({}); }}>
          <option value="">Pick a farm…</option>
          {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      {farmId && !opts && <p className="text-xs text-stone-500">Loading the farm&apos;s files…</p>}
      {opts && (
        <>
          {p.inputs.map((i) => (
            <div key={i.name} className="flex flex-wrap items-center gap-2">
              <span className="w-40 font-mono text-xs">{i.name}{i.required ? "" : " (optional)"}</span>
              {DOC_KINDS.has(i.kind) || i.kind === "basemap" ? (
                <select className={`${selectCls} max-w-md`} value={choices[i.name] ?? ""} onChange={(e) => setChoices({ ...choices, [i.name]: e.target.value })}>
                  <option value="">{i.required ? `Pick a ${i.kind === "basemap" ? "basemap" : "document"}…` : "None"}</option>
                  {(i.kind === "basemap" ? opts.basemaps : opts.documents).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              ) : (
                <label className="flex items-center gap-2 text-stone-600">
                  {!i.required && <input type="checkbox" checked={!skipAuto[i.name]} onChange={(e) => setSkipAuto({ ...skipAuto, [i.name]: !e.target.checked })} />}
                  {i.kind === "farm_fields" ? `The farm's ${opts.fields} field boundaries` : i.kind === "context_rasters" ? `The farm's context rasters (${opts.context} on file, this season's used)` : kindLabel(i.kind)}
                </label>
              )}
            </div>
          ))}
          {p.params.length > 0 && (
            <div className="flex flex-wrap items-end gap-3">
              {p.params.map((x) => (
                <label key={x.name} className="space-y-1" title={x.help}>
                  <span className="block text-xs text-stone-500">{x.name.replace(/_/g, " ")}</span>
                  {x.type === "choice" ? (
                    <select className={selectCls} value={params[x.name] ?? ""} onChange={(e) => setParams({ ...params, [x.name]: e.target.value })}>
                      {(x.choices ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : x.type === "boolean" ? (
                    <select className={selectCls} value={params[x.name] ?? ""} onChange={(e) => setParams({ ...params, [x.name]: e.target.value })}>
                      <option value="true">yes</option><option value="false">no</option>
                    </select>
                  ) : (
                    <Input className="h-9 w-28" value={params[x.name] ?? ""} onChange={(e) => setParams({ ...params, [x.name]: e.target.value })} />
                  )}
                </label>
              ))}
            </div>
          )}
          {error && <p className="text-red-600">{error}</p>}
          <Button size="sm" disabled={busy} onClick={() => void start()}>{busy ? "Starting…" : "Run"}</Button>
        </>
      )}
    </div>
  );
}

export function CatalogClient({
  configured, catalog, farms, runs, canRun, isAdmin, triggers, projects, dataTables,
}: {
  configured: boolean; catalog: PipelineCatalog | null; farms: { id: number; name: string }[]; runs: Run[]; canRun: boolean;
  isAdmin: boolean; triggers: TriggerRow[]; projects: { id: number; name: string }[]; dataTables: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const active = runs.some((r) => r.status === "pending" || r.status === "running");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [active, router]);

  return (
    <div className="space-y-4">
      {!configured ? (
        <p className="text-sm text-amber-700">No processing machine is configured (PROCESSING_URL).</p>
      ) : !catalog ? (
        <p className="text-sm text-amber-700">The processing machine didn&apos;t answer, so the catalogue can&apos;t be shown right now.</p>
      ) : catalog.pipelines.length === 0 ? (
        <p className="text-sm text-stone-500">No pipelines are available yet.</p>
      ) : (
        catalog.pipelines.map((p) => (
          <Card key={p.key}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{p.name}</CardTitle>
                <p className="font-mono text-xs text-stone-400">{p.key} · v{p.version}{p.status !== "live" ? ` · ${p.status}` : ""}</p>
              </div>
              {canRun && <Button size="sm" variant="outline" onClick={() => setOpen(open === p.key ? null : p.key)}>{open === p.key ? "Close" : "Run…"}</Button>}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {p.description && <p className="whitespace-pre-wrap text-stone-700">{p.description}</p>}
              <div className="grid gap-3 text-xs text-stone-600 sm:grid-cols-2">
                <div><span className="font-medium text-stone-800">In:</span> {p.inputs.map((i) => `${kindLabel(i.kind)}${i.required ? "" : " (optional)"}`).join("; ")}</div>
                <div><span className="font-medium text-stone-800">Out:</span> {p.outputs.map((o) => `${o.name.replace(/_/g, " ")} (${kindLabel(o.kind)})`).join("; ")}</div>
              </div>
              <p className="text-xs text-stone-400">Steps: {p.steps.map((s) => `${s.op}${s.optional ? " (optional)" : ""}`).join(" → ")}</p>
              <TriggerRules p={p} rules={triggers.filter((t) => t.pipeline_key === p.key)} isAdmin={isAdmin} projects={projects} dataTables={dataTables} />
              {open === p.key && <RunForm p={p} farms={farms} onDone={() => { setOpen(null); router.refresh(); }} />}
            </CardContent>
          </Card>
        ))
      )}
      {catalog && Object.keys(catalog.errors).length > 0 && (
        <p className="text-xs text-amber-700">
          Definitions that failed their checks on the processing machine: {Object.entries(catalog.errors).map(([k, v]) => `${k} (${v})`).join("; ")}
        </p>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Recent runs</CardTitle></CardHeader>
        <CardContent>
          {runs.length === 0 ? <p className="text-sm text-stone-500">None yet.</p> : (
            <div className="space-y-3">
              {runs.map((r) => (
                <div key={r.id} className="border-t border-stone-100 pt-3 text-sm first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={STATUS_TONE[r.status] ?? ""}>{r.status}</Badge>
                    <span className="font-medium">{r.name}</span>
                    {r.farm_id && <Link href={`/farms/${r.farm_id}`} className="text-blue-700 hover:underline">{r.farm_name ?? `Farm ${r.farm_id}`}</Link>}
                    <span className="text-xs text-stone-400">#{r.id} · {r.created_at.slice(0, 16).replace("T", " ")}{r.trigger ? ` · automatic, on ${r.trigger}` : ""}</span>
                  </div>
                  {r.error_message && <p className="text-xs text-red-700">{r.error_message}</p>}
                  {r.steps.length > 0 && (
                    <p className="text-xs text-stone-500">
                      {r.steps.map((s) => `${s.id}: ${s.status}${s.seconds != null ? ` (${s.seconds}s)` : ""}${s.error ? ` — ${s.error}` : ""}${s.notes?.length ? ` — ${s.notes.join("; ")}` : ""}`).join(" · ")}
                    </p>
                  )}
                  {r.outputs.length > 0 && (
                    <p className="text-xs text-stone-600">
                      Kept: {r.outputs.map((o) => o.error ? `${o.name} (failed: ${o.error})` : `${o.name.replace(/_/g, " ")} → ${o.farm_layer_id ? "map layer" : o.basemap_id ? "map raster" : "document"}`).join("; ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
