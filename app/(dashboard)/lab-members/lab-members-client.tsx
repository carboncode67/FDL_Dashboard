"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, CheckCircle2, Smartphone } from "lucide-react";

interface LabMemberRow {
  id: number;
  Name: string | null;
  Position: string | null;
  Status: string | null;
  FAA_Part_107: boolean;
  Contact_Phone: string | null;
  Contact_Email: string | null;
  has_token: boolean;
}

function statusVariant(status: string | null): "default" | "secondary" | "outline" {
  if (status === "Active") return "default";
  if (status?.startsWith("Inactive")) return "secondary";
  return "outline";
}

export function LabMembersClient({ data }: { data: LabMemberRow[] }) {
  const router = useRouter();

  const columns = [
    { key: "Name", header: "Name" },
    { key: "Position", header: "Position" },
    {
      key: "Status",
      header: "Status",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as LabMemberRow;
        return r.Status ? (
          <Badge variant={statusVariant(r.Status)}>{r.Status}</Badge>
        ) : (
          <span className="text-slate-400">—</span>
        );
      },
    },
    {
      key: "FAA_Part_107",
      header: "FAA Part 107",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as LabMemberRow;
        return r.FAA_Part_107 ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <span className="text-slate-300">—</span>
        );
      },
    },
    { key: "Contact_Phone", header: "Phone" },
    { key: "Contact_Email", header: "Email" },
    {
      key: "has_token",
      header: "App Access",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as LabMemberRow;
        return r.has_token ? (
          <Badge variant="default" className="gap-1">
            <Smartphone className="h-3 w-3" />
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-slate-400">None</Badge>
        );
      },
    },
    {
      key: "_actions",
      header: "",
      render: (row: Record<string, unknown>) => (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); router.push(`/lab-members/${(row as unknown as LabMemberRow).id}/edit`); }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      title="Lab Members"
      data={data as unknown as Record<string, unknown>[]}
      columns={columns}
      searchKeys={["Name", "Position", "Status"]}
      onAdd={() => router.push("/lab-members/new")}
      addLabel="New Member"
      onRowClick={(row) => router.push(`/lab-members/${(row as unknown as LabMemberRow).id}`)}
    />
  );
}
