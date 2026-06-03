import { UserForm } from "@/components/forms/user-form";
import Link from "next/link";

export default function NewUserPage() {
  return (
    <div className="max-w-sm space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/users" className="hover:text-slate-900">Users</Link>
          <span>/</span>
          <span>New</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Create Dashboard User</h2>
      </div>
      <UserForm />
    </div>
  );
}
