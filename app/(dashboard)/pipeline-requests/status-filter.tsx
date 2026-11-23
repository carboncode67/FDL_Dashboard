"use client";

import { useRouter } from "next/navigation";
import { REQUEST_STATUSES, REQUEST_STATUS_LABELS } from "@/lib/pipeline-kinds";

export function RequestStatusFilter({ status, mine }: { status: string; mine: boolean }) {
  const router = useRouter();
  const go = (s: string, m: boolean) => {
    const q = new URLSearchParams();
    if (s) q.set("status", s);
    if (m) q.set("mine", "1");
    router.push(`/pipeline-requests${q.size ? `?${q}` : ""}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <select className="h-8 rounded-md border border-stone-200 bg-white px-2" value={status} onChange={(e) => go(e.target.value, mine)}>
        <option value="">All statuses</option>
        {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{REQUEST_STATUS_LABELS[s]}</option>)}
      </select>
      <label className="flex items-center gap-1.5 text-stone-600">
        <input type="checkbox" checked={mine} onChange={(e) => go(status, e.target.checked)} /> Only mine
      </label>
    </div>
  );
}
