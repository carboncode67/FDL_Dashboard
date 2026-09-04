"use client";

import { useRouter } from "next/navigation";
import { LabMemberForm } from "@/components/forms/lab-member-form";
import Link from "next/link";

interface Props {
  member: {
    id: string;
    name: string | null;
    position: string | null;
    contact_phone: string | null;
    email: string;
    status: string | null;
    faa_part_107: boolean;
    category: string;
  };
}

export default function EditLabMemberClient({ member }: Props) {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/lab-members" className="hover:text-slate-900">Lab Members</Link>
          <span>/</span>
          <span>Edit</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Edit {member.name ?? member.email}</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <LabMemberForm memberId={member.id} initialData={member} onSuccess={() => router.push(`/lab-members/${member.id}`)} />
      </div>
    </div>
  );
}
