"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { ChevronDown, ChevronRight, FolderKanban, Search, Trash2, GitMerge, AlertTriangle } from "lucide-react";
import { isFlaggedDuplicate } from "@/lib/upload-item-utils";

export interface UploadItem {
  id: number;
  table: "photos" | "notes" | "recordings" | "locations" | "lab-member-uploads" | "documents" | "videos";
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
  possible_duplicate_of: number | null;
  duplicate_dismissed: boolean;
  needs_further_processing: boolean;
  annotation_count?: number;
}

interface FarmOption { id: number; name: string; }
export interface MetricOption {
  id: number;
  label: string;
  field_type: "text" | "number" | "select" | "boolean";
  unit: string | null;
  options: string[] | null;
}
export interface CategoryOption {
  id: number;
  name: string;
  media_types: string[];
  metrics: MetricOption[];
}

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
  document: "Document",
  video: "Video",
  "lab-member-upload": "Lab Member",
};
export const STAGE_OPTIONS = [
  "Unread",
  "Read",
  "AI Processed",
  "AI Verification Needed",
  "Validated",
];

type Tab = "images" | "other";

// Collapse items sharing a merge_group_id into one representative row/card
// (earliest received_at), re-sorted with standalone items by recency.
// Shared by both tabs -- groups never mix media types today.
function groupItems(items: UploadItem[]) {
  const groups = new Map<string, UploadItem[]>();
  const standalone: UploadItem[] = [];
  for (const item of items) {
    if (item.merge_group_id) {
      const list = groups.get(item.merge_group_id) ?? [];
      list.push(item);
      groups.set(item.merge_group_id, list);
    } else {
      standalone.push(item);
    }
  }
  const groupRepresentatives = Array.from(groups.values()).map((members) =>
    members.slice().sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime())[0]
  );
  const rows = [...standalone, ...groupRepresentatives].sort(
    (a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
  );
  return { displayRows: rows, groupMap: groups };
}

export function DataSortingClient({
  items: initialItems,
  categories,
  farms,
  canDelete,
  activeFilter,
}: {
  items: UploadItem[];
  categories: CategoryOption[];
  farms: FarmOption[];
  canDelete: boolean;
  activeFilter?: { projectCount: number; farmCount: number } | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState(initialItems);
  const [activeTab, setActiveTab] = useState<Tab>(() => (searchParams.get("tab") === "other" ? "other" : "images"));
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get("status") ?? "all");
  const [filterType, setFilterType] = useState(() => searchParams.get("type") ?? "all");
  const [filterFarm, setFilterFarm] = useState(() => searchParams.get("farm") ?? "all");
  const [filterDuplicate, setFilterDuplicate] = useState(() => searchParams.get("duplicate") === "1");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Multi-select bulk action state (shared by both tabs)
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkFarm, setBulkFarm] = useState("");
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const lastSelectedKeyRef = useRef<string | null>(null);

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    setSelected(new Set());
    setSelectMode(false);
    setActionError(null);
  }

  function toggleGroup(groupId: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  }

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  // Keep filters in the URL so they survive opening an item and navigating back.
  // Uses the raw History API (not router.replace) so typing in the search box
  // doesn't trigger a server re-fetch of every upload on each keystroke --
  // filtering here is entirely client-side, the URL is just for persistence.
  useEffect(() => {
    const params = new URLSearchParams({
      tab: activeTab,
      status: filterStatus,
      type: filterType,
      farm: filterFarm,
      search,
      duplicate: filterDuplicate ? "1" : "0",
    });
    window.history.replaceState(null, "", `/data-sorting?${params.toString()}`);
  }, [activeTab, filterStatus, filterType, filterFarm, search, filterDuplicate]);

  const hasActiveFilters =
    filterStatus !== "all" || filterType !== "all" || filterFarm !== "all" || search !== "" || filterDuplicate;

  function clearFilters() {
    setSearch("");
    setFilterStatus("all");
    setFilterType("all");
    setFilterFarm("all");
    setFilterDuplicate(false);
  }

  const filtered = items.filter((item) => {
    if (filterStatus !== "all" && item.status !== Number(filterStatus)) return false;
    if (filterType !== "all" && item.media_type !== filterType) return false;
    if (filterFarm !== "all" && item.farm_id !== Number(filterFarm)) return false;
    if (filterDuplicate && !isFlaggedDuplicate(item)) return false;
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

  const imageItems = filtered.filter((i) => i.media_type === "photo");
  const otherItems = filtered.filter((i) => i.media_type !== "photo");

  const { displayRows: imageRows, groupMap: imageGroupMap } = useMemo(() => groupItems(imageItems), [imageItems]);
  const { displayRows: otherRows, groupMap: otherGroupMap } = useMemo(() => groupItems(otherItems), [otherItems]);

  const displayRows = activeTab === "images" ? imageRows : otherRows;
  const groupMap = activeTab === "images" ? imageGroupMap : otherGroupMap;
  const groupCount = imageGroupMap.size + otherGroupMap.size;

  // Select-all state derived from the active tab's displayRows
  const selectedDisplayCount = displayRows.filter((r) => selected.has(`${r.table}-${r.id}`)).length;
  const allDisplaySelected = displayRows.length > 0 && selectedDisplayCount === displayRows.length;

  // Keep the select-all checkbox indeterminate state in sync
  if (selectAllRef.current) {
    selectAllRef.current.indeterminate = selectedDisplayCount > 0 && !allDisplaySelected;
  }

  function toggleAllDisplay() {
    setSelected((prev) => {
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
        const isSelecting = !selected.has(key);
        setSelected((prev) => {
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
      tab: activeTab,
      status: filterStatus,
      type: filterType,
      farm: filterFarm,
      search,
      duplicate: filterDuplicate ? "1" : "0",
    });
    router.push(`/data-sorting/${item.table}/${item.id}?${params.toString()}`);
  }

  async function handleDelete(e: React.MouseEvent, item: UploadItem) {
    e.stopPropagation();
    const key = `${item.table}-${item.id}`;
    setDeleting(key);
    setActionError(null);
    try {
      const res = await fetch(`/api/uploads/${item.table}/${item.id}`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => !(i.id === item.id && i.table === item.table)));
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        setActionError(body.error ?? "Delete failed — you may not have permission.");
      }
    } finally {
      setDeleting(null);
    }
  }

  async function handleBulkDelete() {
    setBulkBusy(true);
    setActionError(null);
    const keys = Array.from(selected);
    for (const key of keys) {
      const lastDash = key.lastIndexOf("-");
      const table = key.slice(0, lastDash);
      const id = key.slice(lastDash + 1);
      const res = await fetch(`/api/uploads/${table}/${id}`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => `${i.table}-${i.id}` !== key));
      } else {
        const body = await res.json().catch(() => ({}));
        setActionError(body.error ?? "One or more deletes failed.");
        break;
      }
    }
    setBulkBusy(false);
    setSelected(new Set());
    setSelectMode(false);
    router.refresh();
  }

  async function handleBulkGroup() {
    if (selected.size < 2) return;
    setBulkBusy(true);
    setActionError(null);
    const groupItemsPayload = Array.from(selected).map((key) => {
      const lastDash = key.lastIndexOf("-");
      return { table: key.slice(0, lastDash), id: Number(key.slice(lastDash + 1)) };
    });
    try {
      const res = await fetch("/api/uploads/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: groupItemsPayload }),
      });
      if (res.ok) {
        setSelected(new Set());
        setSelectMode(false);
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        setActionError(body.error ?? "Group failed.");
      }
    } finally {
      setBulkBusy(false);
    }
  }

  // Shared bulk-patch helper: applies `data` to every selected item, one
  // PATCH per item (same pattern as bulk delete above).
  async function bulkPatch(data: Record<string, unknown>) {
    setBulkBusy(true);
    setActionError(null);
    for (const key of selected) {
      const lastDash = key.lastIndexOf("-");
      const table = key.slice(0, lastDash);
      const id = key.slice(lastDash + 1);
      const res = await fetch(`/api/uploads/${table}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setActionError(body.error ?? "One or more updates failed.");
        break;
      }
    }
    setBulkBusy(false);
    router.refresh();
  }

  async function handleBulkAssignCategory() {
    if (!bulkCategory || selected.size === 0) return;
    await bulkPatch({ category: bulkCategory });
  }

  async function handleBulkAssignFarm() {
    if (!bulkFarm || selected.size === 0) return;
    await bulkPatch({ farm_id: Number(bulkFarm) });
  }

  async function handleBulkFlag() {
    if (selected.size === 0) return;
    await bulkPatch({ needs_further_processing: true });
  }

  const selectedCount = selected.size;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-900">Data Sorting</h2>

      {activeFilter && (activeFilter.projectCount > 0 || activeFilter.farmCount > 0) && (
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          <FolderKanban className="h-4 w-4 shrink-0" />
          <span>
            Filtered to{" "}
            {activeFilter.projectCount > 0 && (
              <strong>{activeFilter.projectCount} project{activeFilter.projectCount !== 1 ? "s" : ""}</strong>
            )}
            {activeFilter.projectCount > 0 && activeFilter.farmCount > 0 && ", "}
            {activeFilter.farmCount > 0 && (
              <strong>{activeFilter.farmCount} farm{activeFilter.farmCount !== 1 ? "s" : ""}</strong>
            )}
            . Change in <strong>Dashboard Filters</strong> (header menu).
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        <button
          onClick={() => switchTab("images")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "images"
              ? "border-slate-800 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Images ({imageItems.length})
        </button>
        <button
          onClick={() => switchTab("other")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "other"
              ? "border-slate-800 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Other Uploads ({otherItems.length})
        </button>
      </div>

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

        {activeTab === "other" && (
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="h-8 rounded-md border border-input bg-white px-2 text-sm text-slate-700"
          >
            <option value="all">All Media</option>
            <option value="note">Note</option>
            <option value="recording">Recording</option>
            <option value="location">GPS Track</option>
            <option value="document">Document</option>
            <option value="video">Video</option>
          </select>
        )}

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

        <Button
          variant={filterDuplicate ? "secondary" : "outline"}
          size="sm"
          onClick={() => setFilterDuplicate((v) => !v)}
        >
          Possible Duplicates{filterDuplicate ? "" : ` (${items.filter(isFlaggedDuplicate).length})`}
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={!hasActiveFilters}
          onClick={clearFilters}
        >
          Clear Filters
        </Button>

        <span className="ml-auto text-sm text-slate-500">
          {displayRows.length} of {activeTab === "images" ? imageItems.length : otherItems.length}
          {groupCount > 0 && ` (${groupMap.size} merged group${groupMap.size !== 1 ? "s" : ""})`}
        </span>

        <Button
          variant={selectMode ? "secondary" : "outline"}
          size="sm"
          onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
        >
          {selectMode ? "Cancel" : "Select"}
        </Button>
      </div>

      {/* Bulk action bar */}
      {selectMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 py-2">
          <span className="text-sm text-slate-600 mr-2">
            {selectedCount === 0 ? "No items selected" : `${selectedCount} item${selectedCount !== 1 ? "s" : ""} selected`}
          </span>

          {selectedCount > 0 && (
            <>
              <select
                value={bulkFarm}
                onChange={(e) => setBulkFarm(e.target.value)}
                className="h-8 rounded-md border border-input bg-white px-2 text-sm text-slate-700"
              >
                <option value="">Assign farm...</option>
                {farms.map((f) => (
                  <option key={f.id} value={String(f.id)}>{f.name}</option>
                ))}
              </select>
              <Button size="sm" variant="outline" disabled={!bulkFarm || bulkBusy} onClick={handleBulkAssignFarm}>
                Set Farm
              </Button>

              <select
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                className="h-8 rounded-md border border-input bg-white px-2 text-sm text-slate-700"
              >
                <option value="">Assign category...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              <Button size="sm" variant="outline" disabled={!bulkCategory || bulkBusy} onClick={handleBulkAssignCategory}>
                Set Category
              </Button>

              <Button size="sm" variant="outline" disabled={bulkBusy} onClick={handleBulkFlag}>
                <AlertTriangle className="h-3.5 w-3.5 mr-1 text-amber-600" />
                Needs Further Processing
              </Button>

              <Button size="sm" variant="outline" disabled={selectedCount < 2 || bulkBusy} onClick={handleBulkGroup}>
                <GitMerge className="h-3.5 w-3.5 mr-1" />
                Group
              </Button>

              {canDelete && (
                <Button variant="destructive" size="sm" disabled={bulkBusy} onClick={handleBulkDelete}>
                  {bulkBusy ? "Working…" : `Delete ${selectedCount}`}
                </Button>
              )}
            </>
          )}

          <Button variant="ghost" size="sm" onClick={exitSelectMode} className="ml-auto">
            Cancel
          </Button>
        </div>
      )}

      {actionError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {activeTab === "images" ? (
        <ImagesGrid
          displayRows={displayRows}
          groupMap={groupMap}
          expandedGroups={expandedGroups}
          toggleGroup={toggleGroup}
          selectMode={selectMode}
          selected={selected}
          onCheckboxChange={handleCheckboxChange}
          onOpen={openItem}
          allDisplaySelected={allDisplaySelected}
          onToggleAll={toggleAllDisplay}
        />
      ) : (
        <OtherUploadsTable
          displayRows={displayRows}
          groupMap={groupMap}
          expandedGroups={expandedGroups}
          toggleGroup={toggleGroup}
          selectMode={selectMode}
          selected={selected}
          onCheckboxChange={handleCheckboxChange}
          onOpen={openItem}
          allDisplaySelected={allDisplaySelected}
          onToggleAll={toggleAllDisplay}
          selectAllRef={selectAllRef}
          canDelete={canDelete}
          deleting={deleting}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

function ItemBadges({ item, groupCount }: { item: UploadItem; groupCount?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant={STATUS_VARIANT[item.status] ?? "outline"} className="text-xs">
        {STATUS_LABEL[item.status] ?? item.status}
      </Badge>
      {groupCount ? (
        <span className="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
          {groupCount}
        </span>
      ) : null}
      {(item.annotation_count ?? 0) > 0 && (
        <span className="inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-700">
          {item.annotation_count} ann
        </span>
      )}
      {item.needs_further_processing && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-700">
          <AlertTriangle className="h-3 w-3" /> Needs Processing
        </span>
      )}
      {isFlaggedDuplicate(item) && (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
          Duplicate
        </span>
      )}
    </div>
  );
}

function ImagesGrid({
  displayRows,
  groupMap,
  expandedGroups,
  toggleGroup,
  selectMode,
  selected,
  onCheckboxChange,
  onOpen,
  allDisplaySelected,
  onToggleAll,
}: {
  displayRows: UploadItem[];
  groupMap: Map<string, UploadItem[]>;
  expandedGroups: Set<string>;
  toggleGroup: (id: string) => void;
  selectMode: boolean;
  selected: Set<string>;
  onCheckboxChange: (key: string, shiftHeld: boolean) => void;
  onOpen: (item: UploadItem) => void;
  allDisplaySelected: boolean;
  onToggleAll: () => void;
}) {
  // Flatten representative + (expanded) group members into one card list.
  const cards: { item: UploadItem; isGroupRep: boolean; groupCount: number }[] = [];
  for (const item of displayRows) {
    const groupId = item.merge_group_id;
    const members = groupId ? (groupMap.get(groupId) ?? []) : [];
    cards.push({ item, isGroupRep: groupId !== null, groupCount: members.length });
    if (groupId && expandedGroups.has(groupId)) {
      for (const member of members) {
        if (!(member.id === item.id && member.table === item.table)) {
          cards.push({ item: member, isGroupRep: false, groupCount: 0 });
        }
      }
    }
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-md border bg-white py-12 text-center text-slate-500">
        No images found
      </div>
    );
  }

  return (
    <div>
      {selectMode && (
        <label className="flex items-center gap-2 mb-2 text-sm text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 accent-slate-700 cursor-pointer"
            checked={allDisplaySelected}
            onChange={onToggleAll}
          />
          Select all
        </label>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {cards.map(({ item, isGroupRep, groupCount }) => {
          const key = `${item.table}-${item.id}`;
          const isChecked = selected.has(key);
          return (
            <div
              key={key}
              onClick={() => !selectMode && onOpen(item)}
              className={`relative rounded-md border bg-white overflow-hidden cursor-pointer hover:border-slate-400 transition-colors ${
                isChecked ? "ring-2 ring-slate-700" : ""
              }`}
            >
              {selectMode && (
                <div
                  className="absolute top-1.5 left-1.5 z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-slate-700 cursor-pointer"
                    checked={isChecked}
                    onChange={(e) => onCheckboxChange(key, (e.nativeEvent as MouseEvent).shiftKey)}
                  />
                </div>
              )}
              <div className="aspect-square bg-slate-100">
                {item.filename ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/files/photos/${item.filename}`}
                    alt="Upload thumbnail"
                    className="w-full h-full object-cover"
                    style={{ imageOrientation: "from-image" }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                    No preview
                  </div>
                )}
              </div>
              <div className="p-2 space-y-1">
                <ItemBadges item={item} groupCount={isGroupRep ? groupCount : undefined} />
                <p className="text-xs text-slate-600 truncate">{item.uploader ?? "Unknown"}</p>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="truncate">{item.farm ?? "—"}</span>
                  {isGroupRep && (
                    <button
                      className="shrink-0 text-slate-400 hover:text-slate-700"
                      onClick={(e) => { e.stopPropagation(); toggleGroup(item.merge_group_id!); }}
                    >
                      {expandedGroups.has(item.merge_group_id!)
                        ? <ChevronDown className="h-3.5 w-3.5" />
                        : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OtherUploadsTable({
  displayRows,
  groupMap,
  expandedGroups,
  toggleGroup,
  selectMode,
  selected,
  onCheckboxChange,
  onOpen,
  allDisplaySelected,
  onToggleAll,
  selectAllRef,
  canDelete,
  deleting,
  onDelete,
}: {
  displayRows: UploadItem[];
  groupMap: Map<string, UploadItem[]>;
  expandedGroups: Set<string>;
  toggleGroup: (id: string) => void;
  selectMode: boolean;
  selected: Set<string>;
  onCheckboxChange: (key: string, shiftHeld: boolean) => void;
  onOpen: (item: UploadItem) => void;
  allDisplaySelected: boolean;
  onToggleAll: () => void;
  selectAllRef: React.RefObject<HTMLInputElement | null>;
  canDelete: boolean;
  deleting: string | null;
  onDelete: (e: React.MouseEvent, item: UploadItem) => void;
}) {
  const colCount = 7 + (canDelete ? 1 : 0) + (selectMode ? 1 : 0);

  function renderRow(item: UploadItem, opts: { isGroupRep: boolean; groupCount: number; indented: boolean }) {
    const key = `${item.table}-${item.id}`;
    return (
      <TableRow
        key={key}
        className={`cursor-pointer hover:bg-slate-50 ${opts.indented ? "bg-blue-50/40 hover:bg-blue-50" : ""}`}
        onClick={() => !selectMode && onOpen(item)}
      >
        {selectMode && (
          <TableCell onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              className="h-4 w-4 accent-slate-700 cursor-pointer"
              checked={selected.has(key)}
              onChange={(e) => onCheckboxChange(key, (e.nativeEvent as MouseEvent).shiftKey)}
            />
          </TableCell>
        )}
        <TableCell>
          <div className={`flex items-center gap-1.5 ${opts.indented ? "pl-5" : ""}`}>
            {opts.isGroupRep && (
              <button
                className="text-slate-400 hover:text-slate-700"
                onClick={(e) => { e.stopPropagation(); toggleGroup(item.merge_group_id!); }}
              >
                {expandedGroups.has(item.merge_group_id!)
                  ? <ChevronDown className="h-3.5 w-3.5" />
                  : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            )}
            <span className={opts.indented ? "text-slate-500" : "font-medium"}>
              {item.uploader ?? <span className="text-slate-400">Unknown</span>}
            </span>
            {item.uploader_type === "lab_member" && (
              <span className="ml-1.5 text-xs text-slate-400">(lab)</span>
            )}
            {opts.isGroupRep && opts.groupCount > 0 && (
              <span className="ml-1 inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                {opts.groupCount}
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
        <TableCell>
          <ItemBadges item={item} />
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
              disabled={deleting === key}
              onClick={(e) => onDelete(e, item)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </TableCell>
        )}
      </TableRow>
    );
  }

  return (
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
                  onChange={onToggleAll}
                  aria-label="Select all"
                />
              </TableHead>
            )}
            <TableHead>Uploaded By</TableHead>
            <TableHead>Farm</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Category</TableHead>
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
              const groupId = item.merge_group_id;
              const groupMembers = groupId ? (groupMap.get(groupId) ?? []) : [];
              const isGroupRep = groupId !== null;
              const isExpanded = groupId ? expandedGroups.has(groupId) : false;

              const primaryRow = renderRow(item, { isGroupRep, groupCount: groupMembers.length, indented: false });

              const memberRows = isExpanded && isGroupRep
                ? groupMembers
                    .filter((m) => !(m.id === item.id && m.table === item.table))
                    .map((member) => renderRow(member, { isGroupRep: false, groupCount: 0, indented: true }))
                : [];

              return [primaryRow, ...memberRows];
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
