"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { ItemGroupSelect, ManageItemGroupsDialog } from "@/components/item-groups";
import type { ItemGroup } from "@/lib/item-group-types";

interface FormRow {
  id: number;
  title: string;
  group_id: number | null;
  is_active: boolean;
  field_count: number;
  assignment_count: number;
  response_count: number;
}

export function FormsClient({
  data,
  groups,
  canEditGroups,
}: {
  data: FormRow[];
  groups: ItemGroup[];
  canEditGroups: boolean;
}) {
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
    ...(canEditGroups
      ? [{
          key: "group_id",
          header: "Group",
          render: (row: Record<string, unknown>) => {
            const r = row as unknown as FormRow;
            return <ItemGroupSelect groups={groups} value={r.group_id} updateUrl={`/api/forms/${r.id}`} />;
          },
        }]
      : []),
  ];

  return (
    <DataTable
      title="Custom Forms"
      data={data as unknown as Record<string, unknown>[]}
      columns={columns}
      searchKeys={["title"]}
      onAdd={() => router.push("/forms/new")}
      addLabel="New Form"
      actions={canEditGroups ? <ManageItemGroupsDialog kind="forms" groups={groups} itemLabel="forms" /> : undefined}
      grouping={{ groups, groupKey: "group_id", storageKey: "fdl.forms.collapsed-groups" }}
      onRowClick={(row) => router.push(`/forms/${(row as unknown as FormRow).id}/edit`)}
    />
  );
}
