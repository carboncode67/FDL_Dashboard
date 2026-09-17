import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { AuthSessionProvider } from "@/components/session-provider";
import { auth } from "@/lib/auth";
import { getEditMode } from "@/lib/edit-mode";
import { basePrisma } from "@/lib/prisma";
import { effectiveLabSlug } from "@/lib/lab-db";
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
  const platformAdmin = session?.user?.platform_admin ?? false;

  // Resolved via basePrisma (public.labs has no lab_id/RLS of its own) so the
  // label always reflects the platform admin's active "viewing as" lab, not
  // just their home lab_slug baked into the JWT at login.
  const activeLabSlug = await effectiveLabSlug(session);
  const [activeLab, labs] = await Promise.all([
    activeLabSlug
      ? basePrisma.lab.findUnique({ where: { slug: activeLabSlug }, select: { name: true } })
      : null,
    platformAdmin
      ? basePrisma.lab.findMany({ where: { is_active: true }, select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  return (
    <AuthSessionProvider>
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar role={role} className="hidden lg:flex" />
        <div className="flex flex-col flex-1 min-w-0">
          <Header
            title="Farmers Database"
            editMode={editMode}
            role={role}
            labName={activeLab?.name}
            platformAdmin={platformAdmin}
            labs={labs}
            activeLabSlug={activeLabSlug}
            homeLabSlug={session?.user?.lab_slug ?? null}
          />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </AuthSessionProvider>
  );
}
