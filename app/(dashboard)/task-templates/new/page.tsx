"use client";

import { useRouter } from "next/navigation";
import { TaskTemplateForm } from "@/components/forms/task-template-form";
import Link from "next/link";

export default function NewTaskTemplatePage() {
  const router = useRouter();
  return (
    <div className="max-w-lg space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/task-templates" className="hover:text-slate-900">Task Templates</Link>
          <span>/</span>
          <span>New</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">New Task Template</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <TaskTemplateForm onSuccess={() => router.push("/task-templates")} />
      </div>
    </div>
  );
}
