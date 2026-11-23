import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { effectiveLabSlug, runWithLab } from "@/lib/lab-db";
import { agentLabId } from "@/lib/agent/admin";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { REQUEST_STATUS_LABELS, type RequestStatus } from "@/lib/pipeline-kinds";
import { RequestStatusFilter } from "./status-filter";

export const metadata = { title: "Pipeline requests" };

// Pipeline requests (docs/pipeline-requests-plan.md): anyone signed in can ask
// for a processing workflow; the list is also the lab's record of what people
// want processed.
export default async function PipelineRequestsPage({ searchParams }: { searchParams: Promise<{ status?: string; mine?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const slug = await effectiveLabSlug(session);
  const labId = await agentLabId(session, slug);
  const { status, mine } = await searchParams;
  const rows = labId == null ? [] : await runWithLab(slug, () => prisma.pipelineRequest.findMany({
    where: {
      lab_id: labId,
      ...(status && status in REQUEST_STATUS_LABELS ? { status } : {}),
      ...(mine === "1" ? { requested_by_id: session.user.id } : {}),
    },
    orderBy: { created_at: "desc" },
    include: { RequestedBy: { select: { name: true, email: true } } },
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Pipeline requests</h2>
          <p className="max-w-2xl text-sm text-stone-500">
            Ask for a way to process your data: say what goes in, what should come out and what should happen in
            between. The developer builds it from reviewed steps; you can follow its progress here.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/pipeline-catalog" className={buttonVariants({ size: "sm", variant: "outline" })}>Pipeline catalogue</Link>
          <Link href="/pipeline-requests/new" className={buttonVariants({ size: "sm" })}>New request</Link>
        </div>
      </div>
      <RequestStatusFilter status={status ?? ""} mine={mine === "1"} />
      {rows.length === 0 ? (
        <p className="text-sm text-stone-500">No requests{status || mine ? " match" : " yet"}.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-500">
              <tr><th className="px-3 py-2">Request</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Asked by</th><th className="px-3 py-2">Date</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-stone-100">
                  <td className="px-3 py-2">
                    <Link href={`/pipeline-requests/${r.id}`} className="font-medium text-stone-800 hover:underline">{r.name}</Link>
                    <div className="font-mono text-xs text-stone-400">{r.pipeline_key}</div>
                  </td>
                  <td className="px-3 py-2"><Badge variant="outline">{REQUEST_STATUS_LABELS[r.status as RequestStatus] ?? r.status}</Badge></td>
                  <td className="px-3 py-2 text-stone-600">{r.RequestedBy?.name || r.RequestedBy?.email || "—"}</td>
                  <td className="px-3 py-2 text-stone-500">{r.created_at.toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
