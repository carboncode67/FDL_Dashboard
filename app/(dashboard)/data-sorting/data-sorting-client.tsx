"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SlideOverForm } from "@/components/slide-over-form";
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
  media_type: string;
  date_collected: string | null;
  received_at: string;
  status: number;
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

const STATUS_LABEL: Record<number, string> = {
  1: "Unassigned",
  2: "Farm Matched",
  3: "Sorted",
  4: "Completed",
};
const STATUS_VARIANT: Record<number, "outline" | "secondary" | "default" | "destructive"> = {
  1: "outline",
  2: "secondary",
  3: "default",
  4: "destructive",
};
const MEDIA_LABEL: Record<string, string> = {
  photo: "Photo",
  note: "Note",
  recording: "Recording",
  location: "GPS Track",
};
const CATEGORY_OPTIONS = [
  "Crop Observation",
  "Soil Sample",
  "Equipment",
  "Weather",
  "Pest / Disease",
  "Irrigation",
  "Harvest",
  "Other",
];

function MediaPreview({ item }: { item: UploadItem }) {
  if (item.media_type === "photo" && item.filename) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/files/photos/${item.filename}`}
        alt="Upload preview"
        className="w-full max-h-64 object-cover rounded-md border"
      />
    );
  }
  if (item.media_type === "note" && item.content) {
    return (
      <div className="rounded-md border bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
        {item.content}
      </div>
    );
  }
  if (item.media_type === "recording") {
    return (
      <div className="rounded-md border bg-slate-50 p-3 text-sm text-slate-500">
        Audio recording
        {item.date_collected && (
          <span className="ml-2 text-slate-400">
            — {new Date(item.date_collected).toLocaleString()}
          </span>
        )}
      </div>
    );
  }
  if (item.media_type === "location") {
    return (
      <div className="rounded-md border bg-slate-50 p-3 text-sm text-slate-500">
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
    <div className="rounded-md border bg-slate-50 p-3 text-sm text-slate-400">
      No preview available
    </div>
  );
}

function EditPanel({
  item,
  projects,
  onClose,
}: {
  item: UploadItem;
  projects: ProjectOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [category, setCategory] = useState(item.category ?? "");
  const [description, setDescription] = useState(item.description ?? "");
  const [projectId, setProjectId] = useState(item.project_id ? String(item.project_id) : "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/uploads/${item.table}/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: category || null,
        description: description || null,
        project_id: projectId ? Number(projectId) : null,
        status: 3,
      }),
    });
    setSaving(false);
    onClose();
    router.refresh();
  }

  return (
    <SlideOverForm
      open
      onClose={onClose}
      title={MEDIA_LABEL[item.media_type] ?? item.media_type}
      description={`Uploaded by ${item.uploader ?? "Unknown"}${item.farm ? ` · ${item.farm}` : ""}`}
      onSave={handleSave}
      saving={saving}
    >
      <div className="space-y-5">
        <div className="flex gap-2 items-center">
          <Badge variant="outline">{MEDIA_LABEL[item.media_type] ?? item.media_type}</Badge>
          <Badge variant={STATUS_VARIANT[item.status] ?? "outline"}>
            {STATUS_LABEL[item.status] ?? item.status}
          </Badge>
          {item.uploader_type === "lab_member" && (
            <Badge variant="secondary">Lab Member</Badge>
          )}
        </div>

        <MediaPreview item={item} />

        {item.date_collected && (
          <p className="text-xs text-slate-500">
            Collected: {new Date(item.date_collected).toLocaleString()}
          </p>
        )}

        <hr />

        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select category..." />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((opt) => (
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

        <div className="space-y-1.5">
          <Label>Assign to Project</Label>
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

        <p className="text-xs text-slate-400">Saving will set status to &ldquo;Sorted&rdquo; (3).</p>
      </div>
    </SlideOverForm>
  );
}

export function DataSortingClient({
  items,
  projects,
}: {
  items: UploadItem[];
  projects: ProjectOption[];
}) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [selected, setSelected] = useState<UploadItem | null>(null);

  const filtered = items.filter((item) => {
    if (filterStatus !== "all" && item.status !== Number(filterStatus)) return false;
    if (filterType !== "all" && item.media_type !== filterType) return false;
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

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-900">Data Sorting</h2>

      {/* Filter bar */}
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

        <span className="ml-auto text-sm text-slate-500">
          {filtered.length} of {items.length}
        </span>
      </div>

      {/* Table */}
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-slate-500 py-8">
                  No records found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item) => (
                <TableRow
                  key={`${item.table}-${item.id}`}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => setSelected(item)}
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {selected && (
        <EditPanel
          item={selected}
          projects={projects}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
