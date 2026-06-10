import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { AuthSessionProvider } from "@/components/session-provider";
import { auth } from "@/lib/auth";
import { getEditMode } from "@/lib/edit-mode";
import type { Role } from "@/lib/roles";

// Dashboard pages query the DB at request time — never statically prerendered.
// This cascades to all child pages in app/(dashboard)/.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, editMode] = await Promise.all([auth(), getEditMode()]);
  const role = (session?.user?.role ?? "viewer") as Role;

  return (
    <AuthSessionProvider>
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar role={role} />
        <div className="flex flex-col flex-1 min-w-0">
          <Header title="FDL Dashboard" editMode={editMode} role={role} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </AuthSessionProvider>
  );
}
