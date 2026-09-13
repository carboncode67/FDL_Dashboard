"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Planned Changes items 6+7 (docs/raster-tiling-plan.md) — upload UI for
// POST /api/basemaps. Same drag-and-drop shape as DocumentUpload, but for a
// single large GeoTIFF (drone orthomosaic) instead of a small lab-form
// attachment; tiling happens asynchronously on PipelineProcessor afterward,
// so "success" here means "uploaded, tiling in progress" — the raster shows
// up in the Farm map / Create-maps checklists once tiling_status is "ready"
// (a page refresh after the tiling job finishes, not a live progress bar in
// this first pass).

interface Props {
  farmId: number;
}

type Status = "idle" | "uploading" | "success" | "error";

const ALLOWED_EXTENSIONS = [".tif", ".tiff"];

export function BasemapUpload({ farmId }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  function handleFile(f: File) {
    setSelectedFile(f);
    setStatus("idle");
    setMessage("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;

    setStatus("uploading");
    setMessage("");

    const fd = new FormData();
    fd.append("file", selectedFile);
    fd.append("farm_id", String(farmId));

    try {
      const res = await fetch("/api/basemaps", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(json.error ?? "Upload failed");
      } else {
        setStatus("success");
        setMessage(`Uploaded "${selectedFile.name}" — tiling in progress, check back shortly.`);
        setSelectedFile(null);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    } catch {
      setStatus("error");
      setMessage("Network error — try again");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Upload Basemap</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            className={cn(
              "border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer transition-colors",
              dragging ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-400",
              selectedFile ? "bg-slate-50" : "",
            )}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept={ALLOWED_EXTENSIONS.join(",")}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {selectedFile ? (
              <p className="text-sm font-medium text-slate-700">{selectedFile.name}</p>
            ) : (
              <div>
                <p className="text-sm text-slate-500">Drop a GeoTIFF here or click to browse</p>
                <p className="text-xs text-slate-400 mt-1">
                  A drone orthomosaic or other large raster (.tif/.tiff) — tiled automatically after upload.
                </p>
              </div>
            )}
          </div>

          {status === "success" && (
            <p className="text-sm text-green-600 font-medium">{message}</p>
          )}
          {status === "error" && (
            <p className="text-sm text-red-600">{message}</p>
          )}

          <button
            type="submit"
            disabled={!selectedFile || status === "uploading"}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              !selectedFile || status === "uploading"
                ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                : "bg-slate-900 text-white hover:bg-slate-700",
            )}
          >
            {status === "uploading" && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {status === "uploading" ? "Uploading…" : "Upload Basemap"}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
