"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TestForm } from "@/components/forms/test-form";
import { TestSchemaBuilder } from "@/components/test-schema-builder";
import { DocumentUpload } from "@/components/document-upload";
import Link from "next/link";

type Column = { col_index: number; field_type: "text" | "number"; label: string };

type TestDocument = {
  id: number;
  filename: string;
  original_name: string | null;
  file_type: string | null;
  file_size: number | null;
  description: string | null;
  uploaded_at: string;
};

interface Props {
  test: {
    id: number;
    Test_Name: string | null;
    Test_Description: string | null;
    Cost: number | null;
    Methodology: string | null;
    Data_Processing_Instructions: string | null;
    TaskTemplates?: { description: string; classification: string | null; priority: string }[];
  };
  fieldDefs: Column[];
  documents: TestDocument[];
}

export default function EditTestClient({ test, fieldDefs, documents }: Props) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function handleDeleteDocument(docId: number) {
    setDeletingId(docId);
    try {
      const res = await fetch(`/api/tests/${test.id}/documents/${docId}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setDeletingId(null);
    }
  }
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/tests" className="hover:text-slate-900">Tests</Link>
          <span>/</span>
          <span>Edit</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Edit {test.Test_Name ?? `Test #${test.id}`}</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <TestForm testId={test.id} initialData={test} onSuccess={() => router.push("/tests")} />
      </div>
      <div className="bg-white border rounded-lg p-6 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b">Data Template</h3>
        <TestSchemaBuilder testId={test.id} initialColumns={fieldDefs} />
      </div>
      <div className="bg-white border rounded-lg p-6 space-y-4">
        <div className="pb-2 border-b">
          <h3 className="text-sm font-semibold text-slate-900">Lab Forms</h3>
          <p className="text-xs text-slate-500 mt-1">
            Blank forms (PDF/Excel) that accompany samples to the lab. These are synced into each
            farm&apos;s Tests folder by the client.
          </p>
        </div>
        {documents.length > 0 && (
          <ul className="divide-y">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <a
                    href={`/api/files/documents/${doc.filename}`}
                    download={doc.original_name ?? doc.filename}
                    className="font-medium text-slate-900 hover:underline truncate block"
                  >
                    {doc.original_name ?? doc.filename}
                  </a>
                  <p className="text-xs text-slate-500">
                    {doc.file_type?.toUpperCase() ?? "—"}
                    {doc.file_size ? ` · ${Math.round(doc.file_size / 1024)} KB` : ""}
                    {` · ${new Date(doc.uploaded_at).toLocaleDateString()}`}
                    {doc.description ? ` · ${doc.description}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteDocument(doc.id)}
                  disabled={deletingId === doc.id}
                  className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50 shrink-0"
                >
                  {deletingId === doc.id ? "Removing…" : "Remove"}
                </button>
              </li>
            ))}
          </ul>
        )}
        <DocumentUpload testId={test.id} />
      </div>
    </div>
  );
}
