"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, MessageCircle } from "lucide-react";

interface ContactRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  whatsapp: boolean;
  farm_name: string | null;
  created_at: string;
}

export function ContactsClient({ data, canCreate, activeFilter }: { data: ContactRow[]; canCreate?: boolean; activeFilter?: { projectCount: number; farmCount: number } | null }) {
  const router = useRouter();

  const columns = [
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
      <DataTable
        title="Contacts"
        data={data as unknown as Record<string, unknown>[]}
        columns={columns}
        searchKeys={["name", "phone", "email", "farm_name"]}
        onAdd={canCreate ? () => router.push("/contacts/new") : undefined}
        addLabel="New Contact"
        onRowClick={(row) => router.push(`/contacts/${(row as unknown as ContactRow).id}`)}
      />
    </div>
  );
}
