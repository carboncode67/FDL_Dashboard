import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ResponsesClient from "./responses-client";

export default async function FormResponsesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formId = parseInt(id);

  const [form, responses] = await Promise.all([
    prisma.form.findUnique({
      where: { id: formId },
      include: { FieldDefinitions: { orderBy: { col_index: "asc" } } },
    }),
    prisma.formResponse.findMany({
      where: { form_id: formId },
      include: {
        Contact: { select: { name: true } },
        User: { select: { name: true, email: true } },
      },
      orderBy: { submitted_at: "desc" },
    }),
  ]);

  if (!form) notFound();

  return (
    <ResponsesClient
      form={{ id: form.id, title: form.title }}
      fields={form.FieldDefinitions.map((f) => ({ col_index: f.col_index, label: f.label }))}
      responses={responses.map((r) => ({
        id: r.id,
        data: r.data as Record<string, string | number | boolean | null>,
        submitted_at: r.submitted_at.toISOString(),
        recipient: r.Contact?.name ?? r.User?.name ?? r.User?.email ?? "Unknown",
      }))}
    />
  );
}
