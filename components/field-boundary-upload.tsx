"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  farmId: number;
  fieldCount: number;
  drawButton?: React.ReactNode;
}

type Status = "idle" | "uploading" | "success" | "error";

export function FieldBoundaryUpload({ farmId, fieldCount, drawButton }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [epsg, setEpsg] = useState("4326");
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
    fd.append("epsg", epsg);

    try {
      const res = await fetch(`/api/farms/${farmId}/boundaries`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(json.error ?? "Upload failed");
      } else {
        setStatus("success");
        setMessage(`Added ${json.count} field${json.count === 1 ? "" : "s"}`);
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
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Field Boundaries</CardTitle>
        <div className="flex items-center gap-2">
          {drawButton}
          <Badge variant="secondary">{fieldCount} field{fieldCount === 1 ? "" : "s"}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Drop zone */}
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
              accept=".geojson,.json,.zip,.gpkg"
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
                <p className="text-sm text-slate-500">
                  Drop a file here or click to browse
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Supported: .geojson, .json, .zip (shapefile), .gpkg
                </p>
              </div>
            )}
          </div>

          {/* EPSG input */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-600 whitespace-nowrap">
              Coordinate System (EPSG)
            </label>
            <input
              type="number"
              value={epsg}
              onChange={(e) => setEpsg(e.target.value)}
              className="w-32 rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="4326"
              min={1}
            />
            {epsg !== "4326" && (
              <span className="text-xs text-slate-400">will reproject to WGS84</span>
            )}
          </div>

          {/* Status feedback */}
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
            {status === "uploading" ? "Uploading…" : "Upload Boundaries"}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
