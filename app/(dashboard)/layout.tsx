import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { AuthSessionProvider } from "@/components/session-provider";

// Dashboard pages query the DB at request time — never statically prerendered.
// This cascades to all child pages in app/(dashboard)/.
export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthSessionProvider>
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <Header title="OFE Dashboard" />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </AuthSessionProvider>
  );
}
