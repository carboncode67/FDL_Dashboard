import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";
import { loadRequestFormOptions } from "@/lib/pipeline-requests";
import { PipelineRequestForm } from "@/components/pipeline-request-form";

export const metadata = { title: "New pipeline request" };

export default async function NewPipelineRequestPage() {
  return runWithTenant(async () => {
    const session = await auth();
    if (!session?.user) redirect("/login");
    const options = await loadRequestFormOptions(session);
    return (
      <div className="max-w-4xl space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">New pipeline request</h2>
          <p className="text-sm text-stone-500">
            Describe the workflow as well as you can. You can edit it until it&apos;s accepted.
          </p>
        </div>
        <PipelineRequestForm options={options} />
      </div>
    );
  });
}
