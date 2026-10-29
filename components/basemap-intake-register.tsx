"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Planned Changes items 6+7 (docs/raster-tiling-plan.md). The drag-and-drop
// GeoTIFF uploader that used to live here is now part of the unified farm
// upload box (components/farm-data-upload.tsx); this intake-share escape hatch
// is rendered inside that box.

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
export function BasemapIntakeRegister({ farmId, onRegistered }: { farmId: number; onRegistered: () => void }) {
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
    <div className="border-t border-stone-100 pt-4 space-y-2">
      <p className="text-xs text-stone-500">
        Or register a file already dropped on the server&apos;s intake share:
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="space-y-1.5">
        {files.map((f) => (
          <li key={f.filename} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-stone-700" title={f.filename}>
              {f.filename} <span className="text-stone-400">({formatBytes(f.bytes)})</span>
            </span>
            <button
              type="button"
              onClick={() => register(f.filename)}
              disabled={registeringFile !== null}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                registeringFile === f.filename
                  ? "bg-stone-100 text-stone-400"
                  : "bg-stone-900 text-white hover:bg-stone-700",
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
