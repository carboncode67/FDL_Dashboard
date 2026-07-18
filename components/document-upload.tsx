"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  farmId?: number;
  projectId?: number;
  testId?: number;
}

type Status = "idle" | "uploading" | "success" | "error";

const ALLOWED_EXTENSIONS = [".pdf", ".csv", ".docx", ".doc", ".xlsx", ".txt"];

export function DocumentUpload({ farmId, projectId, testId }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
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
    if (description.trim()) fd.append("description", description.trim());

    const url = farmId
      ? `/api/farms/${farmId}/documents`
      : testId
        ? `/api/tests/${testId}/documents`
        : `/api/projects/${projectId}/documents`;

    try {
      const res = await fetch(url, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(json.error ?? "Upload failed");
      } else {
        setStatus("success");
        setMessage(`Uploaded "${selectedFile.name}"`);
        setSelectedFile(null);
        setDescription("");
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
        <CardTitle className="text-base">Upload Document</CardTitle>
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
                <p className="text-sm text-slate-500">Drop a file here or click to browse</p>
                <p className="text-xs text-slate-400 mt-1">
                  Supported: .pdf, .csv, .docx, .doc, .xlsx, .txt
                </p>
              </div>
            )}
          </div>

          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

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
            {status === "uploading" ? "Uploading…" : "Upload Document"}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
