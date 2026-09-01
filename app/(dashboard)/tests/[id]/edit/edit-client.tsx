"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TestForm } from "@/components/forms/test-form";
import { DocumentUpload } from "@/components/document-upload";
import Link from "next/link";

type DataSource = { id: number; name: string; columnCount: number; home: boolean };

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
    methodology_id: number | null;
    TaskTemplates?: { description: string; classification: string | null; priority: string }[];
    RequiredEquipment?: { Drones_id: number }[];
    UsedDataTables?: { Tables_id: number }[];
  };
  dataSources: DataSource[];
  documents: TestDocument[];
}

export default function EditTestClient({ test, dataSources, documents }: Props) {
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
        <div className="flex items-center justify-between pb-2 border-b">
          <h3 className="text-sm font-semibold text-slate-900">Data Sources</h3>
          <Link
            href={`/data-tables/new?test_id=${test.id}`}
            className="text-xs text-emerald-700 hover:text-emerald-900 font-medium"
          >
            + New Dedicated Table
          </Link>
        </div>
        <p className="text-xs text-slate-500">
          Each data source is its own schema — a GPS track, a sample form, a results form — with its
          own processing instructions and pipeline. Attach existing/shared ones below on this form.
        </p>
        {dataSources.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No data tables yet.</p>
        ) : (
          <ul className="divide-y">
            {dataSources.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <Link href={`/data-tables/${d.id}/edit`} className="text-blue-600 hover:underline">
                  {d.name}
                </Link>
                <span className="text-xs text-slate-400">
                  {d.columnCount} column{d.columnCount === 1 ? "" : "s"}{d.home ? "" : " · shared"}
                </span>
              </li>
            ))}
          </ul>
        )}
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
