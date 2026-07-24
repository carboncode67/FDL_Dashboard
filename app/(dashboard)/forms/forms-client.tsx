"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";

interface FormRow {
  id: number;
  title: string;
  is_active: boolean;
  field_count: number;
  assignment_count: number;
  response_count: number;
}

export function FormsClient({ data }: { data: FormRow[] }) {
  const router = useRouter();

  const columns = [
    { key: "title", header: "Title", sortable: true },
    {
      key: "is_active",
      header: "Status",
      render: (row: Record<string, unknown>) => {
        const active = (row as unknown as FormRow).is_active;
        return <Badge variant={active ? "default" : "outline"}>{active ? "Active" : "Inactive"}</Badge>;
      },
    },
    {
      key: "field_count",
      header: "Fields",
      render: (row: Record<string, unknown>) => <span>{(row as unknown as FormRow).field_count}</span>,
    },
    {
      key: "assignment_count",
      header: "Assigned To",
      render: (row: Record<string, unknown>) => <span>{(row as unknown as FormRow).assignment_count}</span>,
    },
    {
      key: "response_count",
      header: "Responses",
      render: (row: Record<string, unknown>) => <span>{(row as unknown as FormRow).response_count}</span>,
    },
  ];

  return (
    <DataTable
      title="Custom Forms"
      data={data as unknown as Record<string, unknown>[]}
      columns={columns}
      searchKeys={["title"]}
      onAdd={() => router.push("/forms/new")}
      addLabel="New Form"
      onRowClick={(row) => router.push(`/forms/${(row as unknown as FormRow).id}/edit`)}
    />
  );
}
