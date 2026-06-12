"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

interface ContactRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  whatsapp: boolean;
  channel: string | null;
  farm_name: string | null;
  created_at: string;
}

export function ContactsClient({ data }: { data: ContactRow[] }) {
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
      key: "channel",
      header: "Channel",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as ContactRow;
        if (r.channel === "whatsapp") return <Badge className="bg-emerald-100 text-emerald-700 text-xs">WhatsApp</Badge>;
        if (r.channel === "sms") return <Badge className="bg-blue-100 text-blue-700 text-xs">SMS</Badge>;
        return <span className="text-slate-300">—</span>;
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
    <DataTable
      title="Contacts"
      data={data as unknown as Record<string, unknown>[]}
      columns={columns}
      searchKeys={["name", "phone", "email", "farm_name"]}
      onAdd={() => router.push("/contacts/new")}
      addLabel="New Contact"
      onRowClick={(row) => router.push(`/contacts/${(row as unknown as ContactRow).id}`)}
    />
  );
}
