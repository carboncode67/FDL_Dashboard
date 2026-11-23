"use client";

// New / edit form for a pipeline request (docs/pipeline-requests-plan.md).
// Everything here is a description for the developer: inputs, outputs and
// settings come from the fixed vocabulary in lib/pipeline-kinds.ts, and
// attachments are reference material only.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ATTACHMENT_MAX_BYTES, DATA_PRODUCTS, INPUT_KINDS, MATCH_TABLES, OUTPUT_KINDS, PARAM_TYPES,
  type InputKind, type OutputKind, type ParamType, type RequestInput, type RequestOutput, type RequestParam, type SampleRef,
} from "@/lib/pipeline-kinds";
import { DATA_PRODUCT_LABELS, type DataProduct } from "@/lib/data-products";

export type RequestFormOptions = {
  projects: { id: number; name: string }[];
  dataTables: { id: number; name: string }[];
  basemaps: { id: number; label: string }[];
  documents: { id: number; label: string }[];
};

export type RequestFormValue = {
  name: string;
  description: string;
  inputs: RequestInput[];
  outputs: RequestOutput[];
  params: RequestParam[];
  sample_data: SampleRef[];
};

const selectCls = "h-9 rounded-md border border-stone-200 bg-white px-2 text-sm";
const areaCls = "w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm";

/** "Soil test PDF" → "soil_test_pdf": the YAML's names are identifiers. */
function toName(s: string): string {
  const n = s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return /^[a-z]/.test(n) ? n : n ? `x_${n}`.slice(0, 40) : "";
}

const EMPTY: RequestFormValue = {
  name: "", description: "",
  inputs: [{ name: "input", kind: "upload", trigger: "manual" }],
  outputs: [{ name: "result", kind: "table" }],
  params: [], sample_data: [],
};

export function PipelineRequestForm({
  options, initial, requestId, onDone,
}: {
  options: RequestFormOptions;
  initial?: RequestFormValue;
  requestId?: number;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [v, setV] = useState<RequestFormValue>(initial ?? EMPTY);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sampleKind, setSampleKind] = useState<"basemap" | "document">("basemap");
  const [sampleId, setSampleId] = useState("");

  const set = <K extends keyof RequestFormValue>(k: K, val: RequestFormValue[K]) => setV((x) => ({ ...x, [k]: val }));
  const setInput = (i: number, patch: Partial<RequestInput>) => set("inputs", v.inputs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setOutput = (i: number, patch: Partial<RequestOutput>) => set("outputs", v.outputs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setParam = (i: number, patch: Partial<RequestParam>) => set("params", v.params.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const spec = { ...v, sample_data: v.sample_data.map(({ kind, id }) => ({ kind, id })) };
      const res = await fetch(requestId ? `/api/pipeline-requests/${requestId}` : "/api/pipeline-requests", {
        method: requestId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestId ? { spec } : spec),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? `Couldn't save (${res.status})`); return; }
      const id = requestId ?? body.id;
      if (files.length) {
        const fd = new FormData();
        for (const f of files) fd.append("file", f);
        const up = await fetch(`/api/pipeline-requests/${id}/attachments`, { method: "POST", body: fd });
        if (!up.ok) {
          const b = await up.json().catch(() => ({}));
          setError(`Saved, but the attachments failed: ${b.error ?? up.status}`);
          router.push(`/pipeline-requests/${id}`);
          return;
        }
      }
      if (onDone) { onDone(); router.refresh(); } else router.push(`/pipeline-requests/${id}`);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  const sampleChoices = sampleKind === "basemap" ? options.basemaps : options.documents;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">What should it do?</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <label className="block space-y-1">
            <span className="text-xs text-stone-500">Name</span>
            <Input value={v.name} maxLength={120} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Canopy cover from drone ortho" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-stone-500">Description</span>
            <textarea className={areaCls} rows={7} maxLength={10_000} value={v.description} onChange={(e) => set("description", e.target.value)}
              placeholder={"What should happen to the data, step by step as far as you know it?\nWhat question or decision will the result answer?\nAny method, paper, spreadsheet or existing script to follow (attach it below)?"} />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Inputs: what data goes in</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {v.inputs.map((inp, i) => {
            const k = INPUT_KINDS[inp.kind];
            return (
              <div key={i} className="space-y-2 rounded-md border border-stone-200 p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="space-y-1">
                    <span className="block text-xs text-stone-500">Name</span>
                    <Input className="h-9 w-40" value={inp.name} onChange={(e) => setInput(i, { name: e.target.value })} onBlur={(e) => setInput(i, { name: toName(e.target.value) })} />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-xs text-stone-500">Kind</span>
                    <select className={selectCls} value={inp.kind}
                      onChange={(e) => { const kind = e.target.value as InputKind; setInput(i, { kind, trigger: INPUT_KINDS[kind].matchable ? inp.trigger : "manual", match: undefined }); }}>
                      {Object.entries(INPUT_KINDS).map(([key, x]) => <option key={key} value={key}>{x.label}</option>)}
                    </select>
                  </label>
                  {k.matchable && (
                    <label className="space-y-1">
                      <span className="block text-xs text-stone-500">Runs</span>
                      <select className={selectCls} value={inp.trigger} onChange={(e) => setInput(i, { trigger: e.target.value as "manual" | "match" })}>
                        <option value="manual">When someone starts it</option>
                        <option value="match">Automatically on matching uploads</option>
                      </select>
                    </label>
                  )}
                  <label className="space-y-1">
                    <span className="block text-xs text-stone-500">Data type (optional)</span>
                    <select className={selectCls} value={inp.data_product ?? ""} onChange={(e) => setInput(i, { data_product: e.target.value || undefined })}>
                      <option value="">—</option>
                      {DATA_PRODUCTS.filter((d) => d !== "none").map((d) => <option key={d} value={d}>{DATA_PRODUCT_LABELS[d as DataProduct]}</option>)}
                    </select>
                  </label>
                  {v.inputs.length > 1 && (
                    <Button size="sm" variant="ghost" aria-label="Remove input" onClick={() => set("inputs", v.inputs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  )}
                </div>
                {inp.trigger === "match" && (
                  <div className="flex flex-wrap items-end gap-2">
                    {(inp.kind === "upload" || inp.kind === "yield_card") && (
                      <label className="space-y-1">
                        <span className="block text-xs text-stone-500">Upload type</span>
                        <select className={selectCls} value={inp.match?.table ?? ""} onChange={(e) => setInput(i, { match: { ...inp.match, table: e.target.value || undefined } })}>
                          <option value="">Any</option>
                          {MATCH_TABLES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </label>
                    )}
                    <label className="space-y-1">
                      <span className="block text-xs text-stone-500">Category</span>
                      <Input className="h-9 w-40" value={inp.match?.category ?? ""} onChange={(e) => setInput(i, { match: { ...inp.match, category: e.target.value || undefined } })} placeholder="any" />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-xs text-stone-500">Project</span>
                      <select className={selectCls} value={inp.match?.project_id ?? ""} onChange={(e) => setInput(i, { match: { ...inp.match, project_id: Number(e.target.value) || undefined } })}>
                        <option value="">Any</option>
                        {options.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </label>
                    {(inp.kind === "document" || inp.kind === "test_data_rows") && (
                      <label className="space-y-1">
                        <span className="block text-xs text-stone-500">Data Table</span>
                        <select className={selectCls} value={inp.match?.data_table_id ?? ""} onChange={(e) => setInput(i, { match: { ...inp.match, data_table_id: Number(e.target.value) || undefined } })}>
                          <option value="">Any</option>
                          {options.dataTables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </label>
                    )}
                  </div>
                )}
                <Input className="h-9" value={inp.note ?? ""} maxLength={500} onChange={(e) => setInput(i, { note: e.target.value || undefined })} placeholder="Note (optional): file format, units, columns that matter…" />
              </div>
            );
          })}
          {v.inputs.length < 10 && (
            <Button size="sm" variant="outline" onClick={() => set("inputs", [...v.inputs, { name: `input_${v.inputs.length + 1}`, kind: "farm_fields", trigger: "manual" }])}>
              <Plus className="mr-1 h-4 w-4" />Add input
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Outputs: what comes out</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {v.outputs.map((out, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border border-stone-200 p-3">
              <label className="space-y-1">
                <span className="block text-xs text-stone-500">Name</span>
                <Input className="h-9 w-40" value={out.name} onChange={(e) => setOutput(i, { name: e.target.value })} onBlur={(e) => setOutput(i, { name: toName(e.target.value) })} />
              </label>
              <label className="space-y-1">
                <span className="block text-xs text-stone-500">Kind</span>
                <select className={selectCls} value={out.kind} onChange={(e) => setOutput(i, { kind: e.target.value as OutputKind })}>
                  {Object.entries(OUTPUT_KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <Input className="h-9 min-w-48 flex-1" value={out.note ?? ""} maxLength={500} onChange={(e) => setOutput(i, { note: e.target.value || undefined })} placeholder="What it should contain (columns, units, colours…)" />
              {v.outputs.length > 1 && (
                <Button size="sm" variant="ghost" aria-label="Remove output" onClick={() => set("outputs", v.outputs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              )}
            </div>
          ))}
          {v.outputs.length < 10 && (
            <Button size="sm" variant="outline" onClick={() => set("outputs", [...v.outputs, { name: `output_${v.outputs.length + 1}`, kind: "vector_layer" }])}>
              <Plus className="mr-1 h-4 w-4" />Add output
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Settings someone may want to change (optional)</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {v.params.map((p, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border border-stone-200 p-3">
              <label className="space-y-1">
                <span className="block text-xs text-stone-500">Name</span>
                <Input className="h-9 w-36" value={p.name} onChange={(e) => setParam(i, { name: e.target.value })} onBlur={(e) => setParam(i, { name: toName(e.target.value) })} />
              </label>
              <label className="space-y-1">
                <span className="block text-xs text-stone-500">Type</span>
                <select className={selectCls} value={p.type} onChange={(e) => setParam(i, { type: e.target.value as ParamType, default: undefined, min: undefined, max: undefined, choices: undefined })}>
                  {PARAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              {p.type === "choice" && (
                <label className="space-y-1">
                  <span className="block text-xs text-stone-500">Choices (comma-separated)</span>
                  <Input className="h-9 w-48" value={(p.choices ?? []).join(", ")} onChange={(e) => setParam(i, { choices: e.target.value.split(",").map((c) => c.trim()) })} />
                </label>
              )}
              {p.type === "boolean" ? (
                <label className="space-y-1">
                  <span className="block text-xs text-stone-500">Default</span>
                  <select className={selectCls} value={p.default == null ? "" : String(p.default)} onChange={(e) => setParam(i, { default: e.target.value === "" ? undefined : e.target.value === "true" })}>
                    <option value="">—</option><option value="true">yes</option><option value="false">no</option>
                  </select>
                </label>
              ) : (
                <label className="space-y-1">
                  <span className="block text-xs text-stone-500">Default</span>
                  <Input className="h-9 w-28" value={p.default == null ? "" : String(p.default)} onChange={(e) => setParam(i, { default: e.target.value === "" ? undefined : e.target.value })} />
                </label>
              )}
              {(p.type === "number" || p.type === "integer") && (
                <>
                  <label className="space-y-1">
                    <span className="block text-xs text-stone-500">Min</span>
                    <Input className="h-9 w-20" value={p.min ?? ""} onChange={(e) => setParam(i, { min: e.target.value === "" ? undefined : (e.target.value as unknown as number) })} />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-xs text-stone-500">Max</span>
                    <Input className="h-9 w-20" value={p.max ?? ""} onChange={(e) => setParam(i, { max: e.target.value === "" ? undefined : (e.target.value as unknown as number) })} />
                  </label>
                </>
              )}
              <Input className="h-9 min-w-40 flex-1" value={p.help ?? ""} maxLength={300} onChange={(e) => setParam(i, { help: e.target.value || undefined })} placeholder="What it controls" />
              <Button size="sm" variant="ghost" aria-label="Remove setting" onClick={() => set("params", v.params.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          {v.params.length < 20 && (
            <Button size="sm" variant="outline" onClick={() => set("params", [...v.params, { name: `setting_${v.params.length + 1}`, type: "number" }])}>
              <Plus className="mr-1 h-4 w-4" />Add setting
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Sample data and reference files</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs text-stone-500">
            Point at data already in the database that the pipeline should work on, and attach anything that explains the
            method: an existing script, a spreadsheet that does it by hand, an example of the output you want. Attachments
            are for the developer to read; they are never run.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <select className={selectCls} value={sampleKind} onChange={(e) => { setSampleKind(e.target.value as "basemap" | "document"); setSampleId(""); }}>
              <option value="basemap">Basemap / ortho</option>
              <option value="document">Document</option>
            </select>
            <select className={`${selectCls} max-w-xs`} value={sampleId} onChange={(e) => setSampleId(e.target.value)}>
              <option value="">Pick one…</option>
              {sampleChoices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <Button size="sm" variant="outline" disabled={!sampleId || v.sample_data.length >= 20}
              onClick={() => {
                const id = Number(sampleId);
                if (v.sample_data.some((s) => s.kind === sampleKind && s.id === id)) return;
                const label = sampleChoices.find((c) => c.id === id)?.label;
                set("sample_data", [...v.sample_data, { kind: sampleKind, id, label }]);
                setSampleId("");
              }}>
              Add
            </Button>
          </div>
          {v.sample_data.length > 0 && (
            <ul className="space-y-1">
              {v.sample_data.map((s, i) => (
                <li key={`${s.kind}-${s.id}`} className="flex items-center gap-2">
                  <span className="text-stone-500">{s.kind}</span> {s.label ?? `#${s.id}`}
                  <button className="text-stone-400 hover:text-red-600" aria-label="Remove" onClick={() => set("sample_data", v.sample_data.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="block space-y-1">
            <span className="text-xs text-stone-500">Attach files (25 MB each){requestId ? ", added to the existing ones" : ""}</span>
            <input type="file" multiple className="text-xs" onChange={(e) => {
              const fs = Array.from(e.target.files ?? []);
              const big = fs.find((f) => f.size > ATTACHMENT_MAX_BYTES);
              if (big) { setError(`${big.name} is over 25 MB`); return; }
              setError(null);
              setFiles(fs);
            }} />
          </label>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button disabled={busy || !v.name.trim() || !v.description.trim()} onClick={() => void submit()}>
          {busy ? "Saving…" : requestId ? "Save changes" : "Submit request"}
        </Button>
        {onDone && <Button variant="outline" disabled={busy} onClick={onDone}>Cancel</Button>}
      </div>
    </div>
  );
}
