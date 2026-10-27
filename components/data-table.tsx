"use client";

import { Fragment, useMemo, useState, useSyncExternalStore } from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Search, Plus, ChevronUp, ChevronDown, ChevronsUpDown, ChevronRight } from "lucide-react";

interface Column<T> {
  key: string;
  header: React.ReactNode;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T extends Record<string, unknown>> {
  title: string;
  data: T[];
  columns: Column<T>[];
  searchKeys?: string[];
  onAdd?: () => void;
  addLabel?: string;
  onRowClick?: (row: T) => void;
  /** Extra header controls, rendered left of the Add button. */
  actions?: React.ReactNode;
  /** Optional collapsible sections: rows are bucketed by `row[groupKey]` (a group id, or
   *  null/unknown → "Ungrouped", shown last). Empty groups still show unless searching. */
  grouping?: {
    groups: { id: number; name: string }[];
    groupKey: string;
    /** localStorage key remembering which sections this viewer collapsed. */
    storageKey: string;
  };
}

const UNGROUPED = "ungrouped";

// Collapsed-section memory: a per-viewer convenience in localStorage, read through
// useSyncExternalStore so the server render (no storage) and hydration agree. Every access is
// guarded — private mode / blocked storage just means sections start expanded.
const COLLAPSE_EVENT = "fdl-data-table-collapse";

function subscribeCollapsed(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(COLLAPSE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(COLLAPSE_EVENT, onChange);
  };
}

function readStorage(key: string | undefined): string | null {
  if (!key) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeCollapsed(key: string, value: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...value]));
  } catch {
    // Storage unavailable — nothing to persist to.
  }
  window.dispatchEvent(new Event(COLLAPSE_EVENT));
}

type SortDir = "asc" | "desc";

export function DataTable<T extends Record<string, unknown>>({
  title,
  data,
  columns,
  searchKeys = [],
  onAdd,
  addLabel = "New",
  onRowClick,
  actions,
  grouping,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const storageKey = grouping?.storageKey;
  const collapsedRaw = useSyncExternalStore(subscribeCollapsed, () => readStorage(storageKey), () => null);
  // Fallback for when storage is unavailable, so collapsing still works for this page view.
  const [localCollapsed, setLocalCollapsed] = useState<Set<string>>(new Set());
  const collapsed = useMemo(() => {
    if (collapsedRaw == null) return localCollapsed;
    try {
      return new Set(JSON.parse(collapsedRaw) as string[]);
    } catch {
      return localCollapsed;
    }
  }, [collapsedRaw, localCollapsed]);

  function toggleSection(key: string) {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setLocalCollapsed(next);
    if (storageKey) writeCollapsed(storageKey, next);
  }

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filtered = search
    ? data.filter((row) =>
        searchKeys.some((key) => {
          const val = row[key];
          return val && String(val).toLowerCase().includes(search.toLowerCase());
        })
      )
    : data;

  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp =
          typeof av === "boolean" && typeof bv === "boolean"
            ? Number(bv) - Number(av)
            : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
        return sortDir === "asc" ? cmp : -cmp;
      })
    : filtered;

  // One section per group (in the given order) + Ungrouped last. While searching, empty
  // sections are hidden and every section is forced open so matches are never tucked away.
  const sections = grouping
    ? (() => {
        const known = new Set(grouping.groups.map((g) => g.id));
        const all = [
          ...grouping.groups.map((g) => ({
            key: String(g.id),
            name: g.name,
            rows: sorted.filter((r) => r[grouping.groupKey] === g.id),
          })),
          {
            key: UNGROUPED,
            name: "Ungrouped",
            rows: sorted.filter((r) => {
              const v = r[grouping.groupKey];
              return v == null || !known.has(v as number);
            }),
          },
        ];
        return all.filter((sec) => sec.rows.length > 0 || (!search && sec.key !== UNGROUPED));
      })()
    : null;

  function renderRows(rows: T[]) {
    return rows.map((row, idx) => (
      <TableRow
        key={idx}
        onClick={() => onRowClick?.(row)}
        className={onRowClick ? "cursor-pointer hover:bg-stone-50" : ""}
      >
        {columns.map((col) => (
          <TableCell key={col.key}>
            {col.render
              ? col.render(row)
              : row[col.key] != null
              ? String(row[col.key])
              : "—"}
          </TableCell>
        ))}
      </TableRow>
    ));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-stone-900">{title}</h2>
        <div className="flex items-center gap-2">
          {actions}
          {onAdd && (
            <Button onClick={onAdd} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              {addLabel}
            </Button>
          )}
        </div>
      </div>

      <div className="relative w-full max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
        <Input
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key}>
                  {col.sortable ? (
                    <button
                      onClick={() => handleSort(col.key)}
                      className="flex items-center gap-1 hover:text-stone-900 transition-colors"
                    >
                      {col.header}
                      {sortKey === col.key ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-stone-500 py-8"
                >
                  No records found
                </TableCell>
              </TableRow>
            ) : sections ? (
              sections.map((sec) => {
                const isOpen = !!search || !collapsed.has(sec.key);
                return (
                  <Fragment key={sec.key}>
                    <TableRow
                      onClick={() => toggleSection(sec.key)}
                      className="cursor-pointer bg-stone-50 hover:bg-stone-100"
                    >
                      <TableCell colSpan={columns.length} className="py-2">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-700">
                          <ChevronRight
                            className={`h-4 w-4 text-stone-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                          />
                          {sec.name}
                          <span className="font-normal text-stone-400">({sec.rows.length})</span>
                        </span>
                      </TableCell>
                    </TableRow>
                    {isOpen &&
                      (sec.rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={columns.length} className="text-sm text-stone-400 pl-10">
                            Empty group
                          </TableCell>
                        </TableRow>
                      ) : (
                        renderRows(sec.rows)
                      ))}
                  </Fragment>
                );
              })
            ) : (
              renderRows(sorted)
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
