"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, CheckCircle2, Smartphone, Mail } from "lucide-react";
import { BulkSendOnboardingEmailModal } from "./bulk-send-onboarding-email-modal";

interface LabMemberRow {
  id: string;
  name: string | null;
  email: string;
  position: string | null;
  status: string | null;
  faa_part_107: boolean;
  contact_phone: string | null;
  role: string;
  has_token: boolean;
  onboarded_at: string | null;
}

function statusVariant(status: string | null): "default" | "secondary" | "outline" {
  if (status === "Active") return "default";
  if (status?.startsWith("Inactive")) return "secondary";
  return "outline";
}

export function LabMembersClient({
  data,
  canCreate,
  canEdit,
}: {
  data: LabMemberRow[];
  canCreate?: boolean;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const eligible = data.filter((r) => r.has_token && r.email);
  const allEligibleSelected = eligible.length > 0 && eligible.every((r) => selected.has(r.id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (allEligibleSelected) return new Set();
      return new Set(eligible.map((r) => r.id));
    });
  }

  const selectedRecipients = data
    .filter((r) => selected.has(r.id))
    .map((r) => ({ id: r.id, name: r.name ?? r.email }));

  const columns = [
    {
      key: "_select",
      header: (
        <input
          type="checkbox"
          className="h-4 w-4 accent-slate-700"
          checked={allEligibleSelected}
          onChange={toggleAll}
          disabled={eligible.length === 0}
          title={eligible.length === 0 ? "No members eligible for onboarding email" : "Select all"}
        />
      ),
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as LabMemberRow;
        const canOnboard = r.has_token && !!r.email;
        return (
          <input
            type="checkbox"
            className="h-4 w-4 accent-slate-700"
            checked={selected.has(r.id)}
            disabled={!canOnboard}
            title={!canOnboard ? "No app access token — grant access first" : undefined}
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggleOne(r.id)}
          />
        );
      },
    },
    { key: "name", header: "Name" },
    { key: "email", header: "Email" },
    { key: "position", header: "Position" },
    {
      key: "status",
      header: "Status",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as LabMemberRow;
        return r.status ? (
          <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
        ) : (
          <span className="text-slate-400">—</span>
        );
      },
    },
    {
      key: "faa_part_107",
      header: "FAA Part 107",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as LabMemberRow;
        return r.faa_part_107 ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <span className="text-slate-300">—</span>
        );
      },
    },
    {
      key: "role",
      header: "Role",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as LabMemberRow;
        return <Badge variant={r.role === "admin" ? "default" : "secondary"}>{r.role}</Badge>;
      },
    },
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
    <div className="space-y-4">
      {canEdit && selected.size > 0 && (
        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-2">
          <span className="text-sm text-slate-700">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button size="sm" onClick={() => setBulkOpen(true)}>
              <Mail className="h-4 w-4 mr-2" />
              Send Onboarding Email
            </Button>
          </div>
        </div>
      )}

      <DataTable
        title="Lab Members"
        data={data as unknown as Record<string, unknown>[]}
        columns={columns}
        searchKeys={["name", "email", "position", "status"]}
        onAdd={canCreate ? () => router.push("/lab-members/new") : undefined}
        addLabel="New Member"
        onRowClick={(row) => router.push(`/lab-members/${(row as unknown as LabMemberRow).id}`)}
      />

      <BulkSendOnboardingEmailModal
        open={bulkOpen}
        recipients={selectedRecipients}
        onClose={() => setBulkOpen(false)}
        onDone={() => setSelected(new Set())}
      />
    </div>
  );
}
