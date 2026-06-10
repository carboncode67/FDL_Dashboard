"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search } from "lucide-react";

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
export const STAGE_OPTIONS = [
  "Unread",
  "AI Processed",
  "AI Verification Needed",
  "Validated",
];

export function DataSortingClient({
  items,
  farms,
}: {
  items: UploadItem[];
  projects: ProjectOption[];
  farms: FarmOption[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterFarm, setFilterFarm] = useState("all");

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

  function openItem(item: UploadItem) {
    const params = new URLSearchParams({
      status: filterStatus,
      type: filterType,
      farm: filterFarm,
      search,
    });
    router.push(`/data-sorting/${item.table}/${item.id}?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-900">Data Sorting</h2>

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
        </span>
      </div>

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Uploaded By</TableHead>
              <TableHead>Farm</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Stage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-slate-500 py-8">
                  No records found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item) => (
                <TableRow
                  key={`${item.table}-${item.id}`}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => openItem(item)}
                >
                  <TableCell>
                    <div>
                      <span className="font-medium">{item.uploader ?? <span className="text-slate-400">Unknown</span>}</span>
                      {item.uploader_type === "lab_member" && (
                        <span className="ml-1.5 text-xs text-slate-400">(lab)</span>
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
                    <Badge variant={STATUS_VARIANT[item.status] ?? "outline"}>
                      {STATUS_LABEL[item.status] ?? item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {item.stage ?? <span className="text-slate-400">—</span>}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
