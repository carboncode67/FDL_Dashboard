"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil } from "lucide-react";
import { EquipmentSignoutForm, type SignoutContact } from "@/components/forms/equipment-signout-form";
import { EquipmentDetailPanel } from "./equipment-detail-panel";

interface ActiveLoan { id: number; contactName: string; signedOutAt: string; dueAt: string }
interface DroneRow {
  id: number;
  Name: string | null;
  Cost_Per_Acre: number | null;
  Mobilization_Cost: number | null;
  Description: string | null;
  quantity: number;
  activeLoans: ActiveLoan[];
  requiredByTests: string[];
  methodology: { id: number; title: string } | null;
}

export function DronesClient({ data, contacts }: { data: DroneRow[]; contacts: SignoutContact[] }) {
  const router = useRouter();
  const [signoutForId, setSignoutForId] = useState<number | null>(null);
  const [detailForId, setDetailForId] = useState<number | null>(null);
  const signoutFor = data.find((d) => d.id === signoutForId) ?? null;
  const detailFor = data.find((d) => d.id === detailForId) ?? null;

  const columns = [
    { key: "Name", header: "Name" },
    {
      key: "_status",
      header: "Status",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as DroneRow;
        const available = r.quantity - r.activeLoans.length;
        const anyOverdue = r.activeLoans.some((l) => new Date(l.dueAt) < new Date());
        const colorClass =
          available >= r.quantity ? "bg-green-100 text-green-700"
          : anyOverdue ? "bg-red-100 text-red-700"
          : "bg-amber-100 text-amber-700";
        return (
          <Badge variant="outline" className={`text-xs ${colorClass}`}>
            {available} of {r.quantity} available
          </Badge>
        );
      },
    },
    {
      key: "Cost_Per_Acre",
      header: "Cost/Acre",
      render: (row: Record<string, unknown>) => {
        const c = (row as unknown as DroneRow).Cost_Per_Acre;
        return <span>{c != null ? `$${c.toLocaleString()}` : "—"}</span>;
      },
    },
    {
      key: "Mobilization_Cost",
      header: "Mobilization Cost",
      render: (row: Record<string, unknown>) => {
        const c = (row as unknown as DroneRow).Mobilization_Cost;
        return <span>{c != null ? `$${c.toLocaleString()}` : "—"}</span>;
      },
    },
    {
      key: "_actions",
      header: "",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as DroneRow;
        const available = r.quantity - r.activeLoans.length;
        return (
          <div className="flex items-center gap-2 justify-end">
            {available > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => { e.stopPropagation(); setSignoutForId(r.id); }}
              >
                Signout
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={(e) => { e.stopPropagation(); router.push(`/drones/${r.id}/edit`); }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <DataTable
        title="Equipment"
        data={data as unknown as Record<string, unknown>[]}
        columns={columns}
        searchKeys={["Name"]}
        onAdd={() => router.push("/drones/new")}
        addLabel="New Equipment"
        onRowClick={(row) => setDetailForId((row as unknown as DroneRow).id)}
      />

      {signoutFor && (
        <EquipmentSignoutForm
          open
          onClose={() => setSignoutForId(null)}
          droneId={signoutFor.id}
          droneName={signoutFor.Name}
          contacts={contacts}
        />
      )}

      {detailFor && (
        <EquipmentDetailPanel
          open
          onClose={() => setDetailForId(null)}
          droneId={detailFor.id}
          droneName={detailFor.Name}
          quantity={detailFor.quantity}
          activeLoans={detailFor.activeLoans}
          requiredByTests={detailFor.requiredByTests}
          methodology={detailFor.methodology}
          contacts={contacts}
        />
      )}
    </>
  );
}
