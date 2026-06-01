"use client";

import { useState } from "react";
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
import { Search, Plus } from "lucide-react";

interface Column<T> {
  key: string;
  header: string;
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
}

export function DataTable<T extends Record<string, unknown>>({
  title,
  data,
  columns,
  searchKeys = [],
  onAdd,
  addLabel = "New",
  onRowClick,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? data.filter((row) =>
        searchKeys.some((key) => {
          const val = row[key];
          return val && String(val).toLowerCase().includes(search.toLowerCase());
        })
      )
    : data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
        {onAdd && (
          <Button onClick={onAdd} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            {addLabel}
          </Button>
        )}
      </div>

      <div className="relative w-full max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
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
                <TableHead key={col.key}>{col.header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-slate-500 py-8"
                >
                  No records found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row, idx) => (
                <TableRow
                  key={idx}
                  onClick={() => onRowClick?.(row)}
                  className={onRowClick ? "cursor-pointer hover:bg-slate-50" : ""}
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
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
