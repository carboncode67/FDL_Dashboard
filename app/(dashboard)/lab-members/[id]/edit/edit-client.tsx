"use client";

import { useRouter } from "next/navigation";
import { LabMemberForm } from "@/components/forms/lab-member-form";
import Link from "next/link";

interface Props {
  member: {
    id: number;
    Name: string | null;
    Position: string | null;
    Contact_Phone: string | null;
    Contact_Email: string | null;
    Status: string | null;
    FAA_Part_107: boolean | null;
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
        <h2 className="text-2xl font-bold text-slate-900">Edit {member.Name ?? `Member #${member.id}`}</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <LabMemberForm memberId={member.id} initialData={member} onSuccess={() => router.push("/lab-members")} />
      </div>
    </div>
  );
}
