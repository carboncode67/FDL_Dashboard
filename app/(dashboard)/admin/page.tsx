import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEditMode } from "@/lib/edit-mode";
import { getOnboardingMessage } from "@/lib/onboarding-message";
import { canDelete } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/roles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EditModeToggle } from "./edit-mode-toggle";
import { OnboardingMessageEditor } from "./onboarding-message-editor";
import { UserRolesTable } from "./user-roles-table";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    redirect("/");
  }

  const [users, editMode, onboardingMessage, projects, allFilters] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        position: true,
        bearer_token: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    getEditMode(),
    getOnboardingMessage(),
    prisma.project.findMany({
      select: { id: true, Project_Name: true },
      orderBy: { Project_Name: "asc" },
    }),
    prisma.userProjectFilter.findMany({ select: { user_id: true, project_id: true } }),
  ]);

  const role = (session.user.role ?? "admin") as Role;
  const showDelete = canDelete(role, editMode);

  const filtersByUser = allFilters.reduce<Record<string, number[]>>((acc, f) => {
    (acc[f.user_id] ??= []).push(f.project_id);
    return acc;
  }, {});

  const projectList = projects.map((p) => ({ id: p.id, name: p.Project_Name ?? `Project ${p.id}` }));

  const usersWithToken = users.map((u) => ({
    ...u,
    has_token: !!u.bearer_token,
    project_filter_ids: filtersByUser[u.id] ?? [],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Admin Panel</h2>
        <p className="text-slate-500 text-sm mt-0.5">Manage user roles and site settings</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Edit Mode</CardTitle>
          <CardDescription>
            When enabled, Tier 2 (Member) users can delete records. Disable when not in use.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EditModeToggle initialEditMode={editMode} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Onboarding Message</CardTitle>
          <CardDescription>
            The first message sent to a farmer over WhatsApp or SMS. Keep this consistent with
            current IRB protocol language. Admins only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingMessageEditor initialMessage={onboardingMessage} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">User Roles</CardTitle>
          <CardDescription>
            Assign roles to dashboard accounts. Changes take effect at next sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-slate-500">
              No accounts yet — bootstrap admin (<code>admin@lab.com</code>) is active.
            </p>
          ) : (
            <UserRolesTable
              users={usersWithToken}
              currentUserId={session.user.id}
              canDelete={showDelete}
              projects={projectList}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
