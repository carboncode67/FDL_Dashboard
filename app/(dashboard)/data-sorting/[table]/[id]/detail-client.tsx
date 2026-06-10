"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import {
  UploadItem,
  CATEGORY_OPTIONS,
  STAGE_OPTIONS,
  STATUS_LABEL,
  STATUS_VARIANT,
  MEDIA_LABEL,
} from "../../data-sorting-client";
import UploadPointMapWrapper from "@/components/upload-point-map-wrapper";
import UploadTrackMapWrapper from "@/components/upload-track-map-wrapper";

interface FarmOption { id: number; name: string; }
interface ProjectOption { id: number; name: string; }

function MediaPreview({ item }: { item: UploadItem }) {
  if (item.media_type === "photo" && item.filename) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/files/photos/${item.filename}`}
        alt="Upload preview"
        className="w-full max-h-[480px] object-contain rounded-md border bg-slate-100"
      />
    );
  }
  if (item.media_type === "note" && item.content) {
    return (
      <div className="rounded-md border bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap min-h-[120px]">
        {item.content}
      </div>
    );
  }
  if (item.media_type === "recording" && item.filename) {
    return (
      <div className="rounded-md border bg-slate-50 p-4 space-y-3">
        <p className="text-sm text-slate-500 font-medium">Audio Recording</p>
        <audio controls className="w-full">
          <source src={`/api/files/recordings/${item.filename}`} />
          Your browser does not support audio playback.
        </audio>
      </div>
    );
  }
  if (item.media_type === "location") {
    return (
      <div className="rounded-md border bg-slate-50 p-4 text-sm text-slate-500">
        GPS track{item.content ? `: ${item.content}` : ""}
        {item.date_collected && (
          <span className="ml-2 text-slate-400">
            — {new Date(item.date_collected).toLocaleString()}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-md border bg-slate-50 p-4 text-sm text-slate-400 min-h-[80px] flex items-center justify-center">
      No preview available
    </div>
  );
}

export default function DetailClient({
  item,
  farms,
  projects,
  prevHref,
  nextHref,
  position,
  total,
  backHref,
}: {
  item: UploadItem;
  farms: FarmOption[];
  projects: ProjectOption[];
  prevHref: string | null;
  nextHref: string | null;
  position: number | null;
  total: number;
  backHref: string;
}) {
  const router = useRouter();
  const [farmId, setFarmId]       = useState(item.farm_id ? String(item.farm_id) : "");
  const [projectId, setProjectId] = useState(item.project_id ? String(item.project_id) : "");
  const [category, setCategory]   = useState(item.category ?? "");
  const [status, setStatus]       = useState(String(item.status));
  const [stage, setStage]         = useState(item.stage ?? "");
  const [description, setDescription] = useState(item.description ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/uploads/${item.table}/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        farm_id:     farmId ? Number(farmId) : null,
        project_id:  projectId ? Number(projectId) : null,
        category:    category || null,
        status:      Number(status),
        stage:       stage || null,
        description: description || null,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    if (nextHref) {
      router.push(nextHref);
    } else {
      router.refresh();
    }
  }

  const hasPointMap = item.latitude !== null && item.longitude !== null;
  const hasTrackMap = Array.isArray(item.gps_track) && item.gps_track.length >= 2;

  return (
    <div className="space-y-0">
      {/* Top action bar */}
      <div className="flex items-center gap-3 pb-4 border-b border-slate-200 mb-6">
        <Link
          href={backHref}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Data Sorting
        </Link>

        <div className="flex items-center gap-2 ml-auto">
          {position !== null && (
            <span className="text-sm text-slate-500">
              {position} of {total}
            </span>
          )}

          {prevHref ? (
            <Link href={prevHref}>
              <Button variant="outline" size="sm" className="gap-1">
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
            </Link>
          ) : (
            <Button variant="outline" size="sm" disabled className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
          )}

          {nextHref ? (
            <Link href={nextHref}>
              <Button variant="outline" size="sm" className="gap-1">
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <Button variant="outline" size="sm" disabled className="gap-1">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Two-column body */}
      <div className="flex gap-6 items-start">
        {/* Left: media + map */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{MEDIA_LABEL[item.media_type] ?? item.media_type}</Badge>
            <Badge variant={STATUS_VARIANT[item.status] ?? "outline"}>
              {STATUS_LABEL[item.status] ?? item.status}
            </Badge>
            {item.uploader_type === "lab_member" && (
              <Badge variant="secondary">Lab Member</Badge>
            )}
          </div>

          <MediaPreview item={item} />

          {hasPointMap && !hasTrackMap && (
            <UploadPointMapWrapper
              lat={item.latitude!}
              lng={item.longitude!}
              label={item.uploader ?? undefined}
            />
          )}
          {hasTrackMap && (
            <UploadTrackMapWrapper
              coordinates={item.gps_track!}
              label={item.uploader ?? undefined}
            />
          )}
        </div>

        {/* Right: metadata + edit form */}
        <div className="w-80 shrink-0 space-y-5">
          {/* Read-only metadata */}
          <div className="rounded-md border bg-white p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Uploaded by</span>
              <span className="font-medium text-slate-800">{item.uploader ?? "Unknown"}</span>
            </div>
            {item.date_collected && (
              <div className="flex justify-between">
                <span className="text-slate-500">Collected</span>
                <span className="text-slate-700">{new Date(item.date_collected).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Received</span>
              <span className="text-slate-700">{new Date(item.received_at).toLocaleString()}</span>
            </div>
          </div>

          {/* Editable fields */}
          <div className="rounded-md border bg-white p-4 space-y-4">
            <p className="text-sm font-semibold text-slate-700">Edit</p>

            <div className="space-y-1.5">
              <Label>Farm</Label>
              <Select value={farmId} onValueChange={(v) => setFarmId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select farm..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— None —</SelectItem>
                  {farms.map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select project..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— None —</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— None —</SelectItem>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v ?? "2")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Unassigned</SelectItem>
                  <SelectItem value="2">Farm Matched</SelectItem>
                  <SelectItem value="3">Sorted</SelectItem>
                  <SelectItem value="4">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Select value={stage} onValueChange={(v) => setStage(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select stage..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— None —</SelectItem>
                  {STAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Add notes or description..."
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full"
            >
              {saving ? "Saving…" : saved ? "Saved!" : "Save & Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
