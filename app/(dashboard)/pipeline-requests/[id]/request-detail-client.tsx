"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PipelineRequestForm, type RequestFormOptions } from "@/components/pipeline-request-form";
import {
  INPUT_KINDS, OUTPUT_KINDS, REQUEST_STATUSES, REQUEST_STATUS_LABELS,
  type RequestInput, type RequestOutput, type RequestParam, type RequestStatus, type SampleRef,
} from "@/lib/pipeline-kinds";
import { DATA_PRODUCT_LABELS, type DataProduct } from "@/lib/data-products";

type Req = {
  id: number; pipeline_key: string; name: string; description: string; status: string;
  inputs: RequestInput[]; outputs: RequestOutput[]; params: RequestParam[]; sample_data: SampleRef[];
  admin_note: string | null; live_version: number | null;
  requested_by: string | null; status_by: string | null; status_at: string | null; created_at: string;
  attachments: { id: number; name: string; bytes: number }[];
};

const selectCls = "h-9 rounded-md border border-stone-200 bg-white px-2 text-sm";

function fmtBytes(n: number) {
  return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`;
}

function matchText(i: RequestInput) {
  if (i.trigger !== "match") return "started by hand";
  const m = i.match ?? {};
  const parts = [m.table, m.category && `category "${m.category}"`, m.project_id && `project #${m.project_id}`, m.data_table_id && `Data Table #${m.data_table_id}`].filter(Boolean);
  return `automatic on ${parts.length ? parts.join(", ") : "any matching upload"}`;
}

export function RequestDetailClient({
  request: r, yaml, canEdit, isAdmin, options,
}: { request: Req; yaml: string; canEdit: boolean; isAdmin: boolean; options: RequestFormOptions | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(r.status);
  const [note, setNote] = useState(r.admin_note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showYaml, setShowYaml] = useState(false);

  async function call(url: string, init: RequestInit): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? `Failed (${res.status})`); return false; }
      return true;
    } catch {
      setError("Network error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (editing && options) {
    return (
      <div className="max-w-4xl space-y-4">
        <h2 className="text-2xl font-bold text-stone-900">Edit request</h2>
        <PipelineRequestForm options={options} requestId={r.id} onDone={() => setEditing(false)}
          initial={{ name: r.name, description: r.description, inputs: r.inputs, outputs: r.outputs, params: r.params, sample_data: r.sample_data }} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/pipeline-requests" className="text-xs text-stone-500 hover:underline">← Pipeline requests</Link>
          <h2 className="text-2xl font-bold text-stone-900">{r.name}</h2>
          <p className="text-sm text-stone-500">
            <span className="font-mono">{r.pipeline_key}</span> · asked by {r.requested_by ?? "a deleted user"} on {r.created_at.slice(0, 10)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{REQUEST_STATUS_LABELS[r.status as RequestStatus] ?? r.status}</Badge>
          {canEdit && options && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>}
          {canEdit && (
            <Button size="sm" variant="ghost" className="text-red-700" disabled={busy}
              onClick={async () => {
                if (!window.confirm("Delete this request and its attachments?")) return;
                if (await call(`/api/pipeline-requests/${r.id}`, { method: "DELETE" })) router.push("/pipeline-requests");
              }}>
              Delete
            </Button>
          )}
        </div>
      </div>

      {r.admin_note && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {r.admin_note}{r.status_by ? <span className="text-amber-700"> · {r.status_by}{r.status_at ? `, ${r.status_at.slice(0, 10)}` : ""}</span> : null}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {isAdmin && (
        <Card>
          <CardHeader><CardTitle className="text-base">Triage (admin)</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-end gap-2 text-sm">
            <label className="space-y-1">
              <span className="block text-xs text-stone-500">Status</span>
              <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{REQUEST_STATUS_LABELS[s]}</option>)}
              </select>
            </label>
            <label className="min-w-64 flex-1 space-y-1">
              <span className="block text-xs text-stone-500">Note to the requester</span>
              <input className="h-9 w-full rounded-md border border-stone-200 px-2" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
            </label>
            <Button size="sm" disabled={busy || (status === r.status && note === (r.admin_note ?? ""))}
              onClick={async () => {
                const body: Record<string, unknown> = { admin_note: note };
                if (status !== r.status) body.status = status;
                if (await call(`/api/pipeline-requests/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })) router.refresh();
              }}>
              Save
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">What it should do</CardTitle></CardHeader>
        <CardContent><p className="whitespace-pre-wrap text-sm text-stone-700">{r.description}</p></CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Inputs</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {r.inputs.map((i) => (
              <div key={i.name}>
                <span className="font-mono text-stone-800">{i.name}</span>: {INPUT_KINDS[i.kind]?.label ?? i.kind}
                <div className="text-xs text-stone-500">
                  {matchText(i)}{i.data_product ? ` · ${DATA_PRODUCT_LABELS[i.data_product as DataProduct] ?? i.data_product}` : ""}
                </div>
                {i.note && <div className="text-xs text-stone-600">{i.note}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Outputs</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {r.outputs.map((o) => (
              <div key={o.name}>
                <span className="font-mono text-stone-800">{o.name}</span>: {OUTPUT_KINDS[o.kind] ?? o.kind}
                {o.note && <div className="text-xs text-stone-600">{o.note}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {r.params.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Settings</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {r.params.map((p) => (
                  <tr key={p.name} className="border-t border-stone-100 first:border-0">
                    <td className="py-1.5 pr-3 font-mono">{p.name}</td>
                    <td className="py-1.5 pr-3 text-stone-500">{p.type}{p.choices ? ` (${p.choices.join(" / ")})` : ""}{p.min != null || p.max != null ? ` [${p.min ?? "…"}–${p.max ?? "…"}]` : ""}</td>
                    <td className="py-1.5 pr-3">{p.default != null ? `default ${String(p.default)}` : ""}</td>
                    <td className="py-1.5 text-stone-600">{p.help}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Sample data and attachments</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {r.sample_data.length === 0 && r.attachments.length === 0 && <p className="text-stone-500">None.</p>}
          {r.sample_data.map((s) => <div key={`${s.kind}-${s.id}`}><span className="text-stone-500">{s.kind} #{s.id}</span> {s.label}</div>)}
          {r.attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-2">
              <a className="text-blue-700 hover:underline" href={`/api/pipeline-requests/${r.id}/attachments/${a.id}`}>{a.name}</a>
              <span className="text-xs text-stone-400">{fmtBytes(a.bytes)}</span>
              {canEdit && (
                <button aria-label={`Remove ${a.name}`} className="text-stone-400 hover:text-red-600" disabled={busy}
                  onClick={async () => { if (await call(`/api/pipeline-requests/${r.id}/attachments/${a.id}`, { method: "DELETE" })) router.refresh(); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Skeleton pipeline.yaml</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowYaml((x) => !x)}>{showYaml ? "Hide" : "Show"}</Button>
            <a className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-sm hover:bg-stone-50" href={`/api/pipeline-requests/${r.id}/skeleton`}>
              <Download className="h-4 w-4" />YAML
            </a>
            <a className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1 text-sm hover:bg-stone-50" href={`/api/pipeline-requests/${r.id}/skeleton?zip=1`}>
              <Download className="h-4 w-4" />Zip with attachments
            </a>
          </div>
        </CardHeader>
        {showYaml && (
          <CardContent>
            <pre className="max-h-[480px] overflow-auto rounded-md bg-stone-900 p-3 text-xs text-stone-100">{yaml}</pre>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
