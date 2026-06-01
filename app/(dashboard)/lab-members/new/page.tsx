"use client";

import { useRouter } from "next/navigation";
import { LabMemberForm } from "@/components/forms/lab-member-form";
import Link from "next/link";

export default function NewLabMemberPage() {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/lab-members" className="hover:text-slate-900">Lab Members</Link>
          <span>/</span>
          <span>New Member</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">New Lab Member</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <LabMemberForm onSuccess={() => router.push("/lab-members")} />
      </div>
    </div>
  );
}
