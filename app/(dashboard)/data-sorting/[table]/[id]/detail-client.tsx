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
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, GitMerge, Trash2, X } from "lucide-react";
import {
  UploadItem,
  CATEGORY_OPTIONS,
  RECORDING_CATEGORY_OPTIONS,
  STATUS_LABEL,
  STATUS_VARIANT,
  MEDIA_LABEL,
} from "../../data-sorting-client";
import { isFlaggedDuplicate } from "@/lib/upload-item-utils";
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
        <audio controls className="w-full" preload="metadata">
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
  similarItems,
  groupMembers,
  duplicateOfItem,
  filterQuery,
  canDelete,
}: {
  item: UploadItem;
  farms: FarmOption[];
  projects: ProjectOption[];
  prevHref: string | null;
  nextHref: string | null;
  position: number | null;
  total: number;
  backHref: string;
  similarItems: UploadItem[];
  groupMembers: UploadItem[];
  duplicateOfItem: UploadItem | null;
  filterQuery: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [farmId, setFarmId]       = useState(item.farm_id ? String(item.farm_id) : "");
  const [projectId, setProjectId] = useState(item.project_id ? String(item.project_id) : "");
  const [category, setCategory]   = useState(item.category ?? "");
  const [status, setStatus]       = useState(String(item.status));
  const [description, setDescription] = useState(item.description ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showMergeBanner, setShowMergeBanner] = useState(similarItems.length > 0 && !item.merge_group_id);
  const [selectedMergeIds, setSelectedMergeIds] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [currentMergeGroup, setCurrentMergeGroup] = useState(item.merge_group_id);
  const [duplicateDismissed, setDuplicateDismissed] = useState(item.duplicate_dismissed);
  const [duplicateBusy, setDuplicateBusy] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const categoryOptions = item.media_type === "recording" ? RECORDING_CATEGORY_OPTIONS : CATEGORY_OPTIONS;
  const showDuplicateBanner = isFlaggedDuplicate({ ...item, duplicate_dismissed: duplicateDismissed });

  async function handleDismissDuplicate() {
    setDuplicateBusy(true);
    setDuplicateError(null);
    try {
      const res = await fetch(`/api/uploads/${item.table}/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicate_dismissed: true }),
      });
      if (res.ok) {
        setDuplicateDismissed(true);
      } else {
        const body = await res.json().catch(() => ({}));
        setDuplicateError(body.error ?? "Failed to dismiss flag.");
      }
    } finally {
      setDuplicateBusy(false);
    }
  }

  async function handleConfirmDuplicateDelete() {
    setDuplicateBusy(true);
    setDuplicateError(null);
    try {
      const res = await fetch(`/api/uploads/${item.table}/${item.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push(backHref);
      } else {
        const body = await res.json().catch(() => ({}));
        setDuplicateError(body.error ?? "Delete failed — you may not have permission.");
        setDuplicateBusy(false);
      }
    } catch {
      setDuplicateBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this upload? This cannot be undone.")) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/uploads/${item.table}/${item.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push(backHref);
      } else {
        const body = await res.json().catch(() => ({}));
        setDeleteError(body.error ?? "Delete failed — you may not have permission.");
        setDeleting(false);
      }
    } catch {
      setDeleting(false);
    }
  }

  function toggleMergeId(key: string) {
    setSelectedMergeIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleMerge() {
    if (selectedMergeIds.size === 0) return;
    setMerging(true);
    setMergeError(null);
    const items = [
      { table: item.table, id: item.id },
      ...Array.from(selectedMergeIds).map((key) => {
        const [t, i] = key.split(":");
        return { table: t, id: Number(i) };
      }),
    ];
    try {
      const res = await fetch("/api/uploads/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentMergeGroup(data.merge_group_id);
        setShowMergeBanner(false);
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        setMergeError(body.error ?? "Merge failed.");
      }
    } finally {
      setMerging(false);
    }
  }

  async function handleUnmerge() {
    await fetch(`/api/uploads/${item.table}/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merge_group_id: null }),
    });
    setCurrentMergeGroup(null);
    router.refresh();
  }

  async function handleSave() {
    setSaving(true);

    const body: Record<string, unknown> = {
      farm_id:     farmId ? Number(farmId) : null,
      project_id:  projectId ? Number(projectId) : null,
      category:    category || null,
      status:      Number(status),
      description: description || null,
    };

    // Auto-advance stage from Unread → Read when a human edits the record
    if (!item.stage || item.stage === "Unread") {
      body.stage = "Read";
    }

    await fetch(`/api/uploads/${item.table}/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

          {canDelete && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1"
              disabled={deleting}
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" /> {deleting ? "Deleting…" : "Delete"}
            </Button>
          )}
        </div>
      </div>

      {deleteError && (
        <p className="text-xs text-red-600 -mt-4 mb-4">{deleteError}</p>
      )}

      {/* Possible duplicate flag */}
      {showDuplicateBanner && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 mb-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-sm font-medium text-amber-800">
              Possible duplicate
              {duplicateOfItem && (
                <>
                  {" "}of{" "}
                  <Link
                    href={`/data-sorting/${duplicateOfItem.table}/${duplicateOfItem.id}?${filterQuery}`}
                    className="underline hover:text-amber-900"
                  >
                    {duplicateOfItem.uploader ?? "another upload"}
                    {duplicateOfItem.date_collected
                      ? ` — ${new Date(duplicateOfItem.date_collected).toLocaleString()}`
                      : ""}
                  </Link>
                </>
              )}
              {" "}(same submitter, matching length/timestamp/position or image).
            </span>
          </div>
          {duplicateError && <p className="text-xs text-red-600">{duplicateError}</p>}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={duplicateBusy}
              onClick={handleDismissDuplicate}
            >
              Not a duplicate
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={duplicateBusy}
              onClick={handleConfirmDuplicateDelete}
            >
              {duplicateBusy ? "Working…" : "Confirm & delete"}
            </Button>
          </div>
        </div>
      )}

      {/* Merge group indicator */}
      {currentMergeGroup && (
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 mb-4">
          <GitMerge className="h-4 w-4 shrink-0" />
          <span>This item is part of a merged group.</span>
          <button
            onClick={handleUnmerge}
            className="ml-auto text-xs text-blue-600 hover:underline"
          >
            Remove from group
          </button>
        </div>
      )}

      {/* Similar items merge banner */}
      {showMergeBanner && !currentMergeGroup && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 mb-4 space-y-3">
          <div className="flex items-center gap-2">
            <GitMerge className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-sm font-medium text-amber-800">
              {similarItems.length} similar {MEDIA_LABEL[item.media_type] ?? item.media_type}
              {similarItems.length !== 1 ? "s" : ""} found nearby — merge them?
            </span>
            <button onClick={() => setShowMergeBanner(false)} className="ml-auto">
              <X className="h-4 w-4 text-amber-500 hover:text-amber-700" />
            </button>
          </div>
          <div className="space-y-1.5">
            {similarItems.map((other) => {
              const key = `${other.table}:${other.id}`;
              return (
                <label key={key} className="flex items-center gap-2 text-sm text-amber-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMergeIds.has(key)}
                    onChange={() => toggleMergeId(key)}
                    className="rounded border-amber-400"
                  />
                  <span>{other.uploader ?? "Unknown"}</span>
                  <span className="text-amber-600">·</span>
                  <span>{other.date_collected ? new Date(other.date_collected).toLocaleString() : new Date(other.received_at).toLocaleString()}</span>
                </label>
              );
            })}
          </div>
          {mergeError && <p className="text-xs text-red-600">{mergeError}</p>}
          <Button
            size="sm"
            disabled={selectedMergeIds.size === 0 || merging}
            onClick={handleMerge}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {merging ? "Merging…" : `Merge ${selectedMergeIds.size > 0 ? selectedMergeIds.size + 1 : ""} items`}
          </Button>
        </div>
      )}

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
            <div className="flex justify-between">
              <span className="text-slate-500">Stage</span>
              <span className="text-slate-700">{item.stage ?? "Unread"}</span>
            </div>
          </div>

          {/* Editable fields */}
          <div className="rounded-md border bg-white p-4 space-y-4">
            <p className="text-sm font-semibold text-slate-700">Edit</p>

            <div className="space-y-1.5">
              <Label>Farm</Label>
              <Select value={farmId} onValueChange={(v) => setFarmId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {farmId ? (farms.find(f => String(f.id) === farmId)?.name ?? farmId) : undefined}
                  </SelectValue>
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
                  <SelectValue>
                    {projectId ? (projects.find(p => String(p.id) === projectId)?.name ?? projectId) : undefined}
                  </SelectValue>
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
                  {categoryOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v ?? "2")}>
                <SelectTrigger className="w-full">
                  <SelectValue>{STATUS_LABEL[Number(status)] ?? status}</SelectValue>
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
              <Label>{item.media_type === "recording" ? "Audio Summary" : "Description"}</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder={item.media_type === "recording" ? "Add audio summary..." : "Add notes or description..."}
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

      {/* Group members panel */}
      {groupMembers.length > 0 && (
        <div className="mt-6 space-y-3">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <GitMerge className="h-4 w-4 text-blue-500" />
            Others in this group ({groupMembers.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {groupMembers.map((member) => (
              <Link
                key={`${member.table}-${member.id}`}
                href={`/data-sorting/${member.table}/${member.id}?${filterQuery}`}
                className="rounded-md border bg-white p-3 space-y-2 hover:border-blue-300 hover:bg-blue-50/40 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-xs">{MEDIA_LABEL[member.media_type] ?? member.media_type}</Badge>
                  <span className="text-xs text-slate-500 ml-auto">
                    {member.date_collected
                      ? new Date(member.date_collected).toLocaleDateString()
                      : new Date(member.received_at).toLocaleDateString()}
                  </span>
                </div>

                {/* Inline preview */}
                {member.media_type === "photo" && member.filename && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/files/photos/${member.filename}`}
                    alt="Group member"
                    className="w-full h-28 object-cover rounded bg-slate-100"
                  />
                )}
                {member.media_type === "note" && member.content && (
                  <p className="text-xs text-slate-600 line-clamp-3 bg-slate-50 rounded p-2">
                    {member.content}
                  </p>
                )}
                {member.media_type === "recording" && member.filename && (
                  <audio controls className="w-full h-8" preload="none">
                    <source src={`/api/files/recordings/${member.filename}`} />
                  </audio>
                )}

                <p className="text-xs text-slate-500">{member.uploader ?? "Unknown"}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
