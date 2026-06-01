"use client";

import { useRouter } from "next/navigation";
import { ProjectForm } from "@/components/forms/project-form";
import Link from "next/link";

interface Props {
  project: {
    id: number;
    Project_Name: string | null;
    Status: string | null;
    Year_Started: number | null;
    Total_Budget: number | null;
    Project_Sponsors: string | null;
  };
}

export default function EditProjectClient({ project }: Props) {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/projects" className="hover:text-slate-900">Projects</Link>
          <span>/</span>
          <Link href={`/projects/${project.id}`} className="hover:text-slate-900">
            {project.Project_Name ?? `Project #${project.id}`}
          </Link>
          <span>/</span>
          <span>Edit</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Edit Project</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <ProjectForm
          projectId={project.id}
          initialData={project}
          onSuccess={() => router.push(`/projects/${project.id}`)}
        />
      </div>
    </div>
  );
}
