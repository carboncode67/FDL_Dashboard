"use client";

import { useRouter } from "next/navigation";
import { ContactForm } from "@/components/forms/contact-form";
import Link from "next/link";

interface FarmOption { id: number; name: string; }

interface EditContactClientProps {
  contactId: number;
  farms: FarmOption[];
  initialData: {
    name: string;
    phone: string | null;
    email: string | null;
    whatsapp: boolean;
    farms_id: number | null;
  };
}

export default function EditContactClient({ contactId, farms, initialData }: EditContactClientProps) {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/contacts" className="hover:text-slate-900">Contacts</Link>
          <span>/</span>
          <Link href={`/contacts/${contactId}`} className="hover:text-slate-900">{initialData.name}</Link>
          <span>/</span>
          <span>Edit</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Edit Contact</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <ContactForm
          contactId={contactId}
          farms={farms}
          initialData={initialData}
          onSuccess={() => router.push(`/contacts/${contactId}`)}
        />
      </div>
    </div>
  );
}
