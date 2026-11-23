"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CatalogPipeline } from "@/lib/processing";

export type TriggerRow = {
  id: number; pipeline_key: string; trigger_input: string; match_table: string;
  match_category: string | null; match_project_id: number | null; match_data_table_id: number | null;
  params: Record<string, unknown>; enabled: boolean;
};

// Kept in step with lib/pipeline-catalog.ts UPLOAD_SOURCES / lib/pipeline-triggers.ts.
const SOURCES: Record<string, string[]> = {
  yield_card: ["documents"], document: ["documents"], upload: ["documents", "photos", "lab-member-uploads"],
};
const AUTO = new Set(["farm_fields", "context_rasters"]);
const selectCls = "h-9 rounded-md border border-stone-200 bg-white px-2 text-sm";

export function TriggerRules({
  p, rules, isAdmin, projects, dataTables,
}: {
  p: CatalogPipeline; rules: TriggerRow[]; isAdmin: boolean;
  projects: { id: number; name: string }[]; dataTables: { id: number; name: string }[];
}) {
  const router = useRouter();
  const triggerable = p.inputs.filter((i) => SOURCES[i.kind]);
  const blocker = p.inputs.find((i) => i.required && !SOURCES[i.kind] && !AUTO.has(i.kind));
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState(triggerable[0]?.name ?? "");
  const kind = p.inputs.find((i) => i.name === input)?.kind ?? "";
  const [table, setTable] = useState("");
  const [category, setCategory] = useState("");
  const [project, setProject] = useState("");
  const [dataTable, setDataTable] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectName = (id: number | null) => projects.find((x) => x.id === id)?.name ?? `project #${id}`;
  const tableName = (id: number | null) => dataTables.find((x) => x.id === id)?.name ?? `Data Table #${id}`;

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? `Failed (${res.status})`); return false; }
      router.refresh();
      return true;
    } catch {
      setError("Network error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (triggerable.length === 0 || blocker) {
    return rules.length === 0 ? null : <p className="text-xs text-amber-700">This pipeline can no longer run automatically; its rules don&apos;t fire.</p>;
  }

  return (
    <div className="space-y-2 rounded-md border border-stone-200 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-stone-800">Runs automatically on</span>
        {isAdmin && !adding && <Button size="sm" variant="ghost" onClick={() => { setAdding(true); setTable(SOURCES[kind]?.[0] ?? ""); }}>Add rule</Button>}
      </div>
      {p.status !== "live" && <p className="text-xs text-amber-700">Rules only fire once the pipeline is live; it&apos;s {p.status}.</p>}
      {rules.length === 0 && !adding && <p className="text-xs text-stone-500">Nothing yet: it only runs when someone starts it.</p>}
      {rules.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={r.enabled} disabled={!isAdmin || busy}
              onChange={(e) => void call(`/api/pipeline-triggers/${r.id}`, { method: "PATCH", body: JSON.stringify({ enabled: e.target.checked }) })} />
            {r.enabled ? "on" : "off"}
          </label>
          <span>
            new <b>{r.match_table}</b>
            {r.match_category ? <> in category <b>{r.match_category}</b></> : null}
            {r.match_project_id ? <> in <b>{projectName(r.match_project_id)}</b></> : null}
            {r.match_data_table_id ? <> matching <b>{tableName(r.match_data_table_id)}</b></> : null}
            {" "}→ <span className="font-mono">{r.trigger_input}</span>
            {Object.keys(r.params ?? {}).length ? <> · {Object.entries(r.params).map(([k, v]) => `${k}=${String(v)}`).join(", ")}</> : null}
          </span>
          {isAdmin && (
            <button aria-label="Delete rule" className="text-stone-400 hover:text-red-600" disabled={busy}
              onClick={() => { if (window.confirm("Delete this rule?")) void call(`/api/pipeline-triggers/${r.id}`, { method: "DELETE" }); }}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      {adding && (
        <div className="flex flex-wrap items-end gap-2">
          {triggerable.length > 1 && (
            <label className="space-y-1">
              <span className="block text-xs text-stone-500">Fills input</span>
              <select className={selectCls} value={input} onChange={(e) => { setInput(e.target.value); const k = p.inputs.find((i) => i.name === e.target.value)?.kind ?? ""; setTable(SOURCES[k]?.[0] ?? ""); }}>
                {triggerable.map((i) => <option key={i.name} value={i.name}>{i.name}</option>)}
              </select>
            </label>
          )}
          <label className="space-y-1">
            <span className="block text-xs text-stone-500">New upload in</span>
            <select className={selectCls} value={table} onChange={(e) => setTable(e.target.value)}>
              {(SOURCES[kind] ?? []).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-stone-500">Category</span>
            <Input className="h-9 w-36" value={category} placeholder="any" onChange={(e) => setCategory(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-stone-500">Project</span>
            <select className={selectCls} value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">Any</option>
              {projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          {table === "documents" && (
            <label className="space-y-1">
              <span className="block text-xs text-stone-500">Data Table</span>
              <select className={selectCls} value={dataTable} onChange={(e) => setDataTable(e.target.value)}>
                <option value="">Any</option>
                {dataTables.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
          )}
          <Button size="sm" disabled={busy || !table}
            onClick={async () => {
              const ok = await call("/api/pipeline-triggers", {
                method: "POST",
                body: JSON.stringify({
                  pipeline_key: p.key, trigger_input: input, match_table: table, match_category: category || null,
                  match_project_id: project ? Number(project) : null, match_data_table_id: dataTable ? Number(dataTable) : null,
                }),
              });
              if (ok) { setAdding(false); setCategory(""); setProject(""); setDataTable(""); }
            }}>
            Save rule
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-xs text-stone-400">
        Fires when a matching upload is filed on a farm (on upload or when sorted), once per upload and pipeline version.
        Other inputs are filled automatically; settings use the pipeline&apos;s defaults.
      </p>
    </div>
  );
}
