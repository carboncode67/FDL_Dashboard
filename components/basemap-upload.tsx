"use client";

import { useEffect, useRef, useState } from "react";
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

interface IntakeFile {
  filename: string;
  bytes: number;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
}

// Sideload alternative to the drag-and-drop uploader below — for a raster too
// large to reliably push through an HTTP upload (see docs/raster-tiling-plan.md's
// 2026-09-15 log). Lists .tif/.tiff files already sitting in BASEMAP_INTAKE_DIR
// (a share dropped there directly, e.g. over SMB) and registers one with a click
// instead of re-uploading its bytes. Renders nothing if the server has no
// BASEMAP_INTAKE_DIR configured or the intake dir is empty — not meant to be a
// visible feature for the common case, just an escape hatch.
function IntakeRegister({ farmId, onRegistered }: { farmId: number; onRegistered: () => void }) {
  const [files, setFiles] = useState<IntakeFile[] | null>(null);
  const [registeringFile, setRegisteringFile] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/basemaps/intake")
      .then((r) => r.json())
      .then((json) => setFiles(json.configured ? json.files : []))
      .catch(() => setFiles([]));
  }, []);

  async function register(filename: string) {
    setRegisteringFile(filename);
    setError("");
    try {
      const res = await fetch("/api/basemaps/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, farm_id: farmId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Registration failed");
        setRegisteringFile(null);
        return;
      }
      setFiles((prev) => prev?.filter((f) => f.filename !== filename) ?? null);
      setRegisteringFile(null);
      onRegistered();
    } catch {
      setError("Network error — try again");
      setRegisteringFile(null);
    }
  }

  if (!files || files.length === 0) return null;

  return (
    <div className="border-t border-slate-100 pt-4 space-y-2">
      <p className="text-xs text-slate-500">
        Or register a file already dropped on the server&apos;s intake share:
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="space-y-1.5">
        {files.map((f) => (
          <li key={f.filename} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-slate-700" title={f.filename}>
              {f.filename} <span className="text-slate-400">({formatBytes(f.bytes)})</span>
            </span>
            <button
              type="button"
              onClick={() => register(f.filename)}
              disabled={registeringFile !== null}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                registeringFile === f.filename
                  ? "bg-slate-100 text-slate-400"
                  : "bg-slate-900 text-white hover:bg-slate-700",
              )}
            >
              {registeringFile === f.filename ? "Registering…" : "Register"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

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

        <IntakeRegister farmId={farmId} onRegistered={() => router.refresh()} />
      </CardContent>
    </Card>
  );
}
