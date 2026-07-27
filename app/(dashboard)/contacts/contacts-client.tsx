"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, MessageCircle, Mail } from "lucide-react";
import { BulkSendOnboardingEmailModal } from "./bulk-send-onboarding-email-modal";

interface ContactRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  whatsapp: boolean;
  farm_name: string | null;
  created_at: string;
  can_onboard: boolean;
  onboarded_at: string | null;
}

export function ContactsClient({
  data,
  canCreate,
  canEdit,
  activeFilter,
  onboardingMessage,
}: {
  data: ContactRow[];
  canCreate?: boolean;
  canEdit?: boolean;
  activeFilter?: { projectCount: number; farmCount: number } | null;
  onboardingMessage: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const eligible = data.filter((r) => r.can_onboard && r.email);
  const allEligibleSelected = eligible.length > 0 && eligible.every((r) => selected.has(r.id));

  function toggleOne(id: number) {
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

  const selectedRecipients = data.filter((r) => selected.has(r.id)).map((r) => ({ id: r.id, name: r.name }));

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
          title={eligible.length === 0 ? "No contacts eligible for onboarding email" : "Select all"}
        />
      ),
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as ContactRow;
        const canOnboard = r.can_onboard && !!r.email;
        return (
          <input
            type="checkbox"
            className="h-4 w-4 accent-slate-700"
            checked={selected.has(r.id)}
            disabled={!canOnboard}
            title={!canOnboard ? (r.email ? "No app token — created outside the Dashboard" : "No email on file") : undefined}
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggleOne(r.id)}
          />
        );
      },
    },
    { key: "name", header: "Name" },
    { key: "phone", header: "Phone" },
    { key: "email", header: "Email" },
    {
      key: "farm_name",
      header: "Farm",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as ContactRow;
        return r.farm_name ?? <span className="text-slate-400">—</span>;
      },
    },
    {
      key: "whatsapp",
      header: "WhatsApp",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as ContactRow;
        return r.whatsapp ? (
          <MessageCircle className="h-4 w-4 text-green-600" />
        ) : (
          <span className="text-slate-300">—</span>
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
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/contacts/${(row as unknown as ContactRow).id}/edit`);
          }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {activeFilter && activeFilter.farmCount > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Filtered to <strong>{activeFilter.farmCount} farm{activeFilter.farmCount !== 1 ? "s" : ""}</strong>. Change in <strong>Dashboard Filters</strong> (header menu).
        </div>
      )}

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
        title="Contacts"
        data={data as unknown as Record<string, unknown>[]}
        columns={columns}
        searchKeys={["name", "phone", "email", "farm_name"]}
        onAdd={canCreate ? () => router.push("/contacts/new") : undefined}
        addLabel="New Contact"
        onRowClick={(row) => router.push(`/contacts/${(row as unknown as ContactRow).id}`)}
      />

      <BulkSendOnboardingEmailModal
        open={bulkOpen}
        recipients={selectedRecipients}
        initialMessage={onboardingMessage}
        onClose={() => setBulkOpen(false)}
        onDone={() => setSelected(new Set())}
      />
    </div>
  );
}
