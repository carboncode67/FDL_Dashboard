"use client";

import { useRouter } from "next/navigation";
import { ContactForm } from "@/components/forms/contact-form";
import Link from "next/link";

interface FarmOption { id: number; name: string; }

export default function NewContactClient({ farms }: { farms: FarmOption[] }) {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/contacts" className="hover:text-slate-900">Contacts</Link>
          <span>/</span>
          <span>New Contact</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">New Contact</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <ContactForm farms={farms} onSuccess={() => router.push("/contacts")} />
      </div>
    </div>
  );
}
