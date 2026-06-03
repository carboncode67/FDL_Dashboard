"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";

interface UploadRow {
  id: number;
  member_name: string | null;
  farm_name: string | null;
  media_type: string;
  date_collected: string | null;
  status: number;
  received_at: string;
}

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
  recording: "Recording",
  note: "Note",
  location: "GPS Track",
};

function StatusSelect({ id, current }: { id: number; current: number }) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);

  async function handleChange(next: number) {
    setSaving(true);
    setValue(next);
    await fetch(`/api/lab-uploads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div
      className="flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      <Badge variant={STATUS_VARIANT[value] ?? "outline"}>
        {STATUS_LABEL[value] ?? value}
      </Badge>
      <select
        value={value}
        disabled={saving}
        onChange={(e) => handleChange(Number(e.target.value))}
        className="text-xs border rounded px-1 py-0.5 bg-white text-slate-700 disabled:opacity-50"
      >
        {[1, 2, 3, 4].map((s) => (
          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
        ))}
      </select>
    </div>
  );
}

export function LabUploadsClient({ data }: { data: UploadRow[] }) {
  const columns = [
    {
      key: "member_name",
      header: "Uploaded By",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as UploadRow;
        return r.member_name ?? <span className="text-slate-400">Unknown</span>;
      },
    },
    {
      key: "farm_name",
      header: "Assigned Farm",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as UploadRow;
        return r.farm_name ?? <span className="text-slate-400">—</span>;
      },
    },
    {
      key: "media_type",
      header: "Media Type",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as UploadRow;
        return <Badge variant="outline">{MEDIA_LABEL[r.media_type] ?? r.media_type}</Badge>;
      },
    },
    {
      key: "date_collected",
      header: "Date Collected",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as UploadRow;
        return r.date_collected
          ? new Date(r.date_collected).toLocaleDateString()
          : <span className="text-slate-400">—</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as UploadRow;
        return <StatusSelect id={r.id} current={r.status} />;
      },
    },
    {
      key: "received_at",
      header: "Received",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as UploadRow;
        return <span className="text-xs text-slate-500">{new Date(r.received_at).toLocaleString()}</span>;
      },
    },
  ];

  return (
    <DataTable
      title="Lab Uploads"
      data={data as unknown as Record<string, unknown>[]}
      columns={columns}
      searchKeys={["member_name", "farm_name", "media_type"]}
    />
  );
}
