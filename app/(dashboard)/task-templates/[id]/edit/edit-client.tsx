"use client";

import { useRouter } from "next/navigation";
import { TaskTemplateForm } from "@/components/forms/task-template-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useState } from "react";

interface Props {
  template: {
    id:             number;
    description:    string;
    classification: string | null;
    priority:       string;
  };
}

export default function EditTaskTemplateClient({ template }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete "${template.description}"?`)) return;
    setDeleting(true);
    await fetch(`/api/task-templates/${template.id}`, { method: "DELETE" });
    router.push("/task-templates");
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Link href="/task-templates" className="hover:text-slate-900">Task Templates</Link>
            <span>/</span>
            <span>Edit</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">{template.description}</h2>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={handleDelete} disabled={deleting} className="text-red-500 hover:text-red-700 hover:bg-red-50 mt-1">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <TaskTemplateForm
          templateId={template.id}
          initialData={template}
          onSuccess={() => router.push("/task-templates")}
        />
      </div>
    </div>
  );
}
