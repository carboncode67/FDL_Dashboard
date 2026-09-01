"use client";

import { useRouter } from "next/navigation";
import { MethodologyForm } from "@/components/forms/methodology-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useState } from "react";

interface Props {
  methodology: {
    id: number;
    title: string;
    body: string;
  };
}

export default function EditMethodologyClient({ methodology }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete "${methodology.title}"? Tests and Equipment linked to it will keep any of their own override text but lose the shared reference.`)) return;
    setDeleting(true);
    await fetch(`/api/methodologies/${methodology.id}`, { method: "DELETE" });
    router.push("/methodologies");
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Link href="/methodologies" className="hover:text-slate-900">Methodologies</Link>
            <span>/</span>
            <span>Edit</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">{methodology.title}</h2>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={handleDelete} disabled={deleting} className="text-red-500 hover:text-red-700 hover:bg-red-50 mt-1">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <MethodologyForm
          methodologyId={methodology.id}
          initialData={methodology}
          onSuccess={() => router.push("/methodologies")}
        />
      </div>
    </div>
  );
}
