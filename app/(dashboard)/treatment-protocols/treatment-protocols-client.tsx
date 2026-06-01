"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

interface ProtocolRow { id: number; Protocol_Name: string | null; Project_Name: string | null; Treatment_Name: string | null; Product: string | null; Is_Control: boolean | null }

export function TreatmentProtocolsClient({ data }: { data: ProtocolRow[] }) {
  const router = useRouter();

  const columns = [
    { key: "Protocol_Name", header: "Protocol Name" },
    { key: "Project_Name", header: "Project" },
    { key: "Treatment_Name", header: "Treatment" },
    { key: "Product", header: "Product" },
    {
      key: "Is_Control",
      header: "Control",
      render: (row: Record<string, unknown>) => (
        <Badge variant={(row as unknown as ProtocolRow).Is_Control ? "default" : "outline"}>
          {(row as unknown as ProtocolRow).Is_Control ? "Yes" : "No"}
        </Badge>
      ),
    },
    {
      key: "_actions",
      header: "",
      render: (row: Record<string, unknown>) => (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); router.push(`/treatment-protocols/${(row as unknown as ProtocolRow).id}/edit`); }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      title="Treatment Protocols"
      data={data as unknown as Record<string, unknown>[]}
      columns={columns}
      searchKeys={["Protocol_Name", "Product", "Project_Name"]}
      onAdd={() => router.push("/treatment-protocols/new")}
      addLabel="New Protocol"
    />
  );
}
