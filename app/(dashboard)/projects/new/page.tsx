"use client";

import { useRouter } from "next/navigation";
import { ProjectForm } from "@/components/forms/project-form";
import Link from "next/link";

export default function NewProjectPage() {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/projects" className="hover:text-slate-900">Projects</Link>
          <span>/</span>
          <span>New Project</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">New Project</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <ProjectForm onSuccess={() => router.push("/projects")} />
      </div>
    </div>
  );
}
