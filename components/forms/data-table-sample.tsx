"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, FileText } from "lucide-react";

interface Props {
  dataTableId: number;
  sampleFilename: string | null;
  sampleOriginalName: string | null;
}

// Parses just enough of a CSV to render a small preview table: split on
// newlines, split each line on commas outside quotes, cap rows/cols.
function parsePreview(text: string, maxRows = 8): string[][] {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0).slice(0, maxRows + 1);
  return lines.map((line) => {
    const out: string[] = [];
    let field = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') { if (line[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ",") { out.push(field); field = ""; }
      else field += c;
    }
    out.push(field);
    return out;
  });
}

export function DataTableSample({ dataTableId, sampleFilename, sampleOriginalName }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[][] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function loadPreview(filename: string) {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/files/data-table-samples/${filename}`);
      if (!res.ok) return;
      setPreview(parsePreview(await res.text()));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/data-tables/${dataTableId}/sample`, { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Upload failed");
        return;
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (!confirm("Remove the attached sample table?")) return;
    setRemoving(true);
    try {
      await fetch(`/api/data-tables/${dataTableId}/sample`, { method: "DELETE" });
      setPreview(null);
      router.refresh();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        A small example table — real rows, not just column labels. Pipelines matched to this Data
        Table send it to the processing LLM alongside the description, so it sees actual values
        (e.g. that a &quot;ReadingA&quot; column holds sensor readings while &quot;X&quot;/&quot;Y&quot;/&quot;Z&quot; are position columns).
      </p>

      {sampleFilename ? (
        <div className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-slate-400" />
              <span className="font-medium">{sampleOriginalName ?? sampleFilename}</span>
            </div>
            <div className="flex gap-2">
              {!preview && (
                <Button type="button" variant="outline" size="sm" disabled={previewLoading}
                  onClick={() => loadPreview(sampleFilename)}>
                  {previewLoading ? "Loading…" : "Preview"}
                </Button>
              )}
              <Button type="button" variant="ghost" size="icon-sm" disabled={removing} onClick={handleRemove}
                className="text-red-500 hover:text-red-700 hover:bg-red-50">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {preview && (
            <div className="overflow-x-auto border rounded-md">
              <table className="text-xs w-full">
                <thead className="bg-slate-50">
                  <tr>{preview[0]?.map((h, i) => <th key={i} className="text-left px-2 py-1 font-medium border-b whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.slice(1).map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {row.map((cell, j) => <td key={j} className="px-2 py-1 whitespace-nowrap">{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic">No sample table attached.</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv,.txt,text/csv"
        className="hidden"
        onChange={(e) => handleUpload(e.target.files)}
      />
      <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
        <Upload className="h-3.5 w-3.5 mr-1" /> {uploading ? "Uploading…" : sampleFilename ? "Replace Sample Table" : "Attach Sample Table"}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
