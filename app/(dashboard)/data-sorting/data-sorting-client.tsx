"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, FolderKanban, Search, Trash2 } from "lucide-react";

export interface UploadItem {
  id: number;
  table: "photos" | "notes" | "recordings" | "locations" | "lab-member-uploads";
  uploader: string | null;
  uploader_type: "contact" | "lab_member";
  farm: string | null;
  farm_id: number | null;
  media_type: string;
  date_collected: string | null;
  received_at: string;
  status: number;
  stage: string | null;
  category: string | null;
  description: string | null;
  project_id: number | null;
  project_name: string | null;
  filename: string | null;
  content: string | null;
  latitude: number | null;
  longitude: number | null;
  gps_track: [number, number][] | null;
  merge_group_id: string | null;
  end_time: string | null;
  annotation_count?: number;
}

interface ProjectOption { id: number; name: string; }
interface FarmOption { id: number; name: string; }

export const STATUS_LABEL: Record<number, string> = {
  1: "Unassigned",
  2: "Farm Matched",
  3: "Sorted",
  4: "Completed",
};
export const STATUS_VARIANT: Record<number, "outline" | "secondary" | "default" | "destructive"> = {
  1: "outline",
  2: "secondary",
  3: "default",
  4: "destructive",
};
export const MEDIA_LABEL: Record<string, string> = {
  photo: "Photo",
  note: "Note",
  recording: "Recording",
  location: "GPS Track",
  "lab-member-upload": "Lab Member",
};
export const CATEGORY_OPTIONS = [
  "Biomass Sample",
  "Grazing Measurement",
  "Plant ID",
  "Implement",
  "Equipment Model Number",
  "Chemical Label",
  "Soil Sample",
  "Pest / Disease",
  "Harvest",
  "Planting",
  "Other",
];
export const RECORDING_CATEGORY_OPTIONS = [
  "Onboarding Interview",
  "Voice Memo",
  "Other",
];
export const STAGE_OPTIONS = [
  "Unread",
  "Read",
  "AI Processed",
  "AI Verification Needed",
  "Validated",
];

export function DataSortingClient({
  items: initialItems,
  farms,
  canDelete,
  activeProjectFilter,
}: {
  items: UploadItem[];
  projects: ProjectOption[];
  farms: FarmOption[];
  canDelete: boolean;
  activeProjectFilter?: { count: number; names: string[] };
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterFarm, setFilterFarm] = useState("all");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Multi-select bulk delete state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const lastSelectedKeyRef = useRef<string | null>(null);

  function toggleGroup(groupId: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  }

  function toggleSelect(key: string) {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedForDelete(new Set());
  }

  const filtered = items.filter((item) => {
    if (filterStatus !== "all" && item.status !== Number(filterStatus)) return false;
    if (filterType !== "all" && item.media_type !== filterType) return false;
    if (filterFarm !== "all" && item.farm_id !== Number(filterFarm)) return false;
    if (search) {
      const q = search.toLowerCase();
      const haystack = [item.uploader, item.farm, item.category, item.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // Collapse items sharing a merge_group_id into a single representative row.
  const { displayRows, groupMap } = useMemo(() => {
    const groups = new Map<string, UploadItem[]>();
    const standalone: UploadItem[] = [];
    for (const item of filtered) {
      if (item.merge_group_id) {
        const list = groups.get(item.merge_group_id) ?? [];
        list.push(item);
        groups.set(item.merge_group_id, list);
      } else {
        standalone.push(item);
      }
    }
    // One representative row per group (earliest received_at) + all standalone rows, re-sorted.
    const groupRepresentatives = Array.from(groups.values()).map((members) =>
      members.slice().sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime())[0]
    );
    const rows = [...standalone, ...groupRepresentatives].sort(
      (a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
    );
    return { displayRows: rows, groupMap: groups };
  }, [filtered]);

  // Select-all state derived from displayRows
  const selectedDisplayCount = displayRows.filter(
    (r) => selectedForDelete.has(`${r.table}-${r.id}`)
  ).length;
  const allDisplaySelected = displayRows.length > 0 && selectedDisplayCount === displayRows.length;

  // Keep the select-all checkbox indeterminate state in sync
  if (selectAllRef.current) {
    selectAllRef.current.indeterminate = selectedDisplayCount > 0 && !allDisplaySelected;
  }

  function toggleAllDisplay() {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (allDisplaySelected) {
        displayRows.forEach((r) => next.delete(`${r.table}-${r.id}`));
      } else {
        displayRows.forEach((r) => next.add(`${r.table}-${r.id}`));
      }
      return next;
    });
  }

  // Flat ordered list of all currently-visible row keys (primary + expanded members),
  // used to compute shift-click ranges.
  const visibleKeys = useMemo(() => {
    const keys: string[] = [];
    for (const item of displayRows) {
      keys.push(`${item.table}-${item.id}`);
      const groupId = item.merge_group_id;
      if (groupId && expandedGroups.has(groupId)) {
        for (const member of groupMap.get(groupId) ?? []) {
          if (!(member.id === item.id && member.table === item.table)) {
            keys.push(`${member.table}-${member.id}`);
          }
        }
      }
    }
    return keys;
  }, [displayRows, expandedGroups, groupMap]);

  function handleCheckboxChange(key: string, shiftHeld: boolean) {
    if (shiftHeld && lastSelectedKeyRef.current !== null) {
      const fromIdx = visibleKeys.indexOf(lastSelectedKeyRef.current);
      const toIdx = visibleKeys.indexOf(key);
      if (fromIdx !== -1 && toIdx !== -1) {
        const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
        const rangeKeys = visibleKeys.slice(start, end + 1);
        const isSelecting = !selectedForDelete.has(key);
        setSelectedForDelete((prev) => {
          const next = new Set(prev);
          for (const k of rangeKeys) {
            if (isSelecting) next.add(k); else next.delete(k);
          }
          return next;
        });
      }
    } else {
      toggleSelect(key);
    }
    lastSelectedKeyRef.current = key;
  }

  function openItem(item: UploadItem) {
    const params = new URLSearchParams({
      status: filterStatus,
      type: filterType,
      farm: filterFarm,
      search,
    });
    router.push(`/data-sorting/${item.table}/${item.id}?${params.toString()}`);
  }

  async function handleDelete(e: React.MouseEvent, item: UploadItem) {
    e.stopPropagation();
    const key = `${item.table}-${item.id}`;
    setDeleting(key);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/uploads/${item.table}/${item.id}`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => !(i.id === item.id && i.table === item.table)));
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        setDeleteError(body.error ?? "Delete failed — you may not have permission.");
      }
    } finally {
      setDeleting(null);
    }
  }

  async function handleBulkDelete() {
    setBulkDeleting(true);
    setDeleteError(null);
    const keys = Array.from(selectedForDelete);
    for (const key of keys) {
      const lastDash = key.lastIndexOf("-");
      const table = key.slice(0, lastDash);
      const id = key.slice(lastDash + 1);
      const res = await fetch(`/api/uploads/${table}/${id}`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => `${i.table}-${i.id}` !== key));
      } else {
        const body = await res.json().catch(() => ({}));
        setDeleteError(body.error ?? "One or more deletes failed.");
        break;
      }
    }
    setBulkDeleting(false);
    setSelectedForDelete(new Set());
    setSelectMode(false);
    router.refresh();
  }

  // Column count for the empty-state colspan
  const colCount = 8 + (canDelete ? 1 : 0) + (selectMode ? 1 : 0);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-900">Data Sorting</h2>

      {activeProjectFilter && activeProjectFilter.count > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          <FolderKanban className="h-4 w-4 shrink-0" />
          <span>
            Filtered to{" "}
            <strong>{activeProjectFilter.count} project{activeProjectFilter.count !== 1 ? "s" : ""}</strong>
            {activeProjectFilter.names.length > 0 && (
              <>: {activeProjectFilter.names.join(", ")}</>
            )}
            . Change in <strong>Project Filters</strong> (header menu).
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search uploader, farm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 w-56"
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-8 rounded-md border border-input bg-white px-2 text-sm text-slate-700"
        >
          <option value="all">All Statuses</option>
          <option value="1">Unassigned</option>
          <option value="2">Farm Matched</option>
          <option value="3">Sorted</option>
          <option value="4">Completed</option>
        </select>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="h-8 rounded-md border border-input bg-white px-2 text-sm text-slate-700"
        >
          <option value="all">All Media</option>
          <option value="photo">Photo</option>
          <option value="note">Note</option>
          <option value="recording">Recording</option>
          <option value="location">GPS Track</option>
        </select>

        <select
          value={filterFarm}
          onChange={(e) => setFilterFarm(e.target.value)}
          className="h-8 rounded-md border border-input bg-white px-2 text-sm text-slate-700"
        >
          <option value="all">All Farms</option>
          {farms.map((f) => (
            <option key={f.id} value={String(f.id)}>{f.name}</option>
          ))}
        </select>

        <span className="ml-auto text-sm text-slate-500">
          {filtered.length} of {items.length}
          {groupMap.size > 0 && ` (${groupMap.size} merged group${groupMap.size !== 1 ? "s" : ""})`}
        </span>

        {canDelete && (
          <Button
            variant={selectMode ? "secondary" : "outline"}
            size="sm"
            onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
          >
            {selectMode ? "Cancel" : "Select"}
          </Button>
        )}
      </div>

      {/* Bulk delete action bar */}
      {selectMode && (
        <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-2">
          <span className="text-sm text-slate-600">
            {selectedForDelete.size === 0
              ? "No items selected"
              : `${selectedForDelete.size} item${selectedForDelete.size !== 1 ? "s" : ""} selected`}
          </span>
          {selectedForDelete.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              disabled={bulkDeleting}
              onClick={handleBulkDelete}
            >
              {bulkDeleting ? "Deleting…" : `Delete ${selectedForDelete.size} item${selectedForDelete.size !== 1 ? "s" : ""}`}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={exitSelectMode} className="ml-auto">
            Cancel
          </Button>
        </div>
      )}

      {deleteError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {deleteError}
        </div>
      )}

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              {selectMode && (
                <TableHead className="w-8">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="h-4 w-4 accent-slate-700 cursor-pointer"
                    checked={allDisplaySelected}
                    onChange={toggleAllDisplay}
                    aria-label="Select all"
                  />
                </TableHead>
              )}
              <TableHead>Uploaded By</TableHead>
              <TableHead>Farm</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Stage</TableHead>
              {canDelete && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center text-slate-500 py-8">
                  No records found
                </TableCell>
              </TableRow>
            ) : (
              displayRows.flatMap((item) => {
                const key = `${item.table}-${item.id}`;
                const groupId = item.merge_group_id;
                const groupMembers = groupId ? (groupMap.get(groupId) ?? []) : [];
                const isGroupRep = groupId !== null;
                const isExpanded = groupId ? expandedGroups.has(groupId) : false;

                const primaryRow = (
                  <TableRow
                    key={key}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => !selectMode && openItem(item)}
                  >
                    {selectMode && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-slate-700 cursor-pointer"
                          checked={selectedForDelete.has(key)}
                          onChange={(e) => handleCheckboxChange(key, (e.nativeEvent as MouseEvent).shiftKey)}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {isGroupRep && (
                          <button
                            className="text-slate-400 hover:text-slate-700"
                            onClick={(e) => { e.stopPropagation(); toggleGroup(groupId!); }}
                          >
                            {isExpanded
                              ? <ChevronDown className="h-3.5 w-3.5" />
                              : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        <span className="font-medium">{item.uploader ?? <span className="text-slate-400">Unknown</span>}</span>
                        {item.uploader_type === "lab_member" && (
                          <span className="ml-1.5 text-xs text-slate-400">(lab)</span>
                        )}
                        {isGroupRep && (
                          <span className="ml-1 inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                            {groupMembers.length}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{item.farm ?? <span className="text-slate-400">—</span>}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{MEDIA_LABEL[item.media_type] ?? item.media_type}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {item.date_collected
                        ? new Date(item.date_collected).toLocaleDateString()
                        : <span className="text-slate-400">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.category ?? <span className="text-slate-400">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.project_name ?? <span className="text-slate-400">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={STATUS_VARIANT[item.status] ?? "outline"}>
                          {STATUS_LABEL[item.status] ?? item.status}
                        </Badge>
                        {(item.annotation_count ?? 0) > 0 && (
                          <span className="inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-700">
                            {item.annotation_count} ann
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {item.stage ?? <span className="text-slate-400">—</span>}
                    </TableCell>
                    {canDelete && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                          disabled={deleting === key || bulkDeleting}
                          onClick={(e) => handleDelete(e, item)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );

                // When a group is expanded, render member rows (excluding the representative) indented
                const memberRows = isExpanded && isGroupRep
                  ? groupMembers
                      .filter((m) => !(m.id === item.id && m.table === item.table))
                      .map((member) => {
                        const mKey = `${member.table}-${member.id}`;
                        return (
                          <TableRow
                            key={mKey}
                            className="cursor-pointer hover:bg-blue-50 bg-blue-50/40"
                            onClick={() => !selectMode && openItem(member)}
                          >
                            {selectMode && (
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-slate-700 cursor-pointer"
                                  checked={selectedForDelete.has(mKey)}
                                  onChange={(e) => handleCheckboxChange(mKey, (e.nativeEvent as MouseEvent).shiftKey)}
                                />
                              </TableCell>
                            )}
                            <TableCell>
                              <div className="flex items-center gap-1.5 pl-5">
                                <span className="text-slate-500">{member.uploader ?? <span className="text-slate-400">Unknown</span>}</span>
                                {member.uploader_type === "lab_member" && (
                                  <span className="ml-1.5 text-xs text-slate-400">(lab)</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{member.farm ?? <span className="text-slate-400">—</span>}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{MEDIA_LABEL[member.media_type] ?? member.media_type}</Badge>
                            </TableCell>
                            <TableCell className="text-sm text-slate-500">
                              {member.date_collected
                                ? new Date(member.date_collected).toLocaleDateString()
                                : <span className="text-slate-400">—</span>}
                            </TableCell>
                            <TableCell className="text-sm">{member.category ?? <span className="text-slate-400">—</span>}</TableCell>
                            <TableCell className="text-sm">{member.project_name ?? <span className="text-slate-400">—</span>}</TableCell>
                            <TableCell>
                              <Badge variant={STATUS_VARIANT[member.status] ?? "outline"}>
                                {STATUS_LABEL[member.status] ?? member.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-slate-500">{member.stage ?? <span className="text-slate-400">—</span>}</TableCell>
                            {canDelete && (
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                  disabled={deleting === mKey || bulkDeleting}
                                  onClick={(e) => handleDelete(e, member)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })
                  : [];

                return [primaryRow, ...memberRows];
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
