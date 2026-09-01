"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { DataTableForm } from "@/components/forms/data-table-form";
import Link from "next/link";

export default function NewDataTablePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const testId = searchParams.get("test_id");
  const droneId = searchParams.get("drone_id");

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/data-tables" className="hover:text-slate-900">Data Tables</Link>
          <span>/</span>
          <span>New</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">New Data Table</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <DataTableForm
          defaultTestId={testId ? parseInt(testId) : undefined}
          defaultDroneId={droneId ? parseInt(droneId) : undefined}
          onSuccess={() => router.push(testId ? `/tests/${testId}/edit` : droneId ? `/drones/${droneId}/edit` : "/data-tables")}
        />
      </div>
    </div>
  );
}
