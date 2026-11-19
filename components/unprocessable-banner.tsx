import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { auth } from "@/lib/auth";
import { basePrisma } from "@/lib/prisma";
import { effectiveLabSlug } from "@/lib/lab-db";
import { agentLabId } from "@/lib/agent/admin";
import { canEdit, type Role } from "@/lib/roles";
import { dataProductLabel } from "@/lib/data-products";

/**
 * Dashboard-home notice for open "Unprocessable data" flags (GitHub issue #3,
 * migration 102): what the agent found that no processing tool covers.
 * Shown to people who can act on it; disappears once every flag is
 * dismissed or resolved (no per-user read state).
 */
export async function UnprocessableBanner() {
  const session = await auth();
  const role = (session?.user?.role ?? "viewer") as Role;
  if (!session?.user || !canEdit(role)) return null;
  const labId = await agentLabId(session, await effectiveLabSlug(session));
  if (labId == null) return null;

  const groups = await basePrisma.processingGap
    .groupBy({
      by: ["data_product"],
      where: { lab_id: labId, status: "open" },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    })
    .catch(() => []);
  const total = groups.reduce((n, g) => n + g._count.id, 0);
  if (!total) return null;

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3">
      <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 text-sm text-rose-900">
        <p className="font-medium">
          {total} upload{total === 1 ? "" : "s"} look{total === 1 ? "s" : ""} like data no processing tool covers yet
        </p>
        <p className="text-rose-900/80 mt-0.5">
          {groups.map((g) => `${dataProductLabel(g.data_product)} (${g._count.id})`).join(" · ")}
        </p>
      </div>
      <Link
        href="/data-sorting?tab=other&unprocessable=1"
        className="text-sm font-medium text-rose-700 hover:underline whitespace-nowrap"
      >
        Review →
      </Link>
    </div>
  );
}
