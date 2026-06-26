"use client";

import { useState, useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KeyRound, LogOut, FolderKanban } from "lucide-react";
import { ChangePasswordForm } from "@/components/forms/change-password-form";
import type { Role } from "@/lib/roles";

interface HeaderProps {
  title: string;
  editMode?: boolean;
  role?: Role;
}

interface ProjectOption {
  id: number;
  name: string;
}

const roleLabels: Record<Role, string> = {
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export function Header({ title, editMode, role }: HeaderProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [projectFilterOpen, setProjectFilterOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [filterSelection, setFilterSelection] = useState<number[]>([]);
  const [savingFilters, setSavingFilters] = useState(false);
  const [loadingFilters, setLoadingFilters] = useState(false);

  const name = session?.user?.name || session?.user?.email || "User";
  const initials = name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  async function openProjectFilters() {
    setProjectFilterOpen(true);
    setLoadingFilters(true);
    try {
      const [projRes, filterRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/profile/project-filters"),
      ]);
      const projData = await projRes.json();
      const filterData = await filterRes.json();
      setProjects(
        (projData as Array<{ id: number; Project_Name: string | null }>).map((p) => ({
          id: p.id,
          name: p.Project_Name ?? `Project ${p.id}`,
        }))
      );
      setFilterSelection(filterData.project_ids ?? []);
    } finally {
      setLoadingFilters(false);
    }
  }

  function toggleProject(pid: number) {
    setFilterSelection((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
    );
  }

  async function saveFilters() {
    setSavingFilters(true);
    try {
      await fetch("/api/profile/project-filters", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_ids: filterSelection }),
      });
      setProjectFilterOpen(false);
      router.refresh();
    } finally {
      setSavingFilters(false);
    }
  }

  return (
    <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {editMode && (
          <span className="rounded px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
            Edit Mode
          </span>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 outline-none">
          <span className="text-sm text-slate-600 hidden sm:block">{name}</span>
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-emerald-600 text-white text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center justify-between gap-2">
              <span className="truncate">{name}</span>
              {role && (
                <span className="text-xs font-medium text-slate-500 shrink-0">
                  {roleLabels[role]}
                </span>
              )}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => setChangePasswordOpen(true)}
              className="cursor-pointer"
            >
              <KeyRound className="mr-2 h-4 w-4" />
              Change Password
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={openProjectFilters}
              className="cursor-pointer"
            >
              <FolderKanban className="mr-2 h-4 w-4" />
              Project Filters
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={async () => { await signOut({ redirect: false }); router.push("/login"); }}
              className="text-red-600 cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <ChangePasswordForm
            email={session?.user?.email ?? ""}
            onSuccess={() => setChangePasswordOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={projectFilterOpen} onOpenChange={setProjectFilterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Project Filters</DialogTitle>
            <DialogDescription>
              Select which projects you want to see data for in Data Sorting and Experiments. Leave
              all unchecked to see data from every project.
            </DialogDescription>
          </DialogHeader>
          {loadingFilters ? (
            <p className="text-sm text-slate-500 py-4 text-center">Loading…</p>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-2 py-1">
              {projects.length === 0 ? (
                <p className="text-sm text-slate-500">No projects found.</p>
              ) : (
                projects.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={filterSelection.includes(p.id)}
                      onChange={() => toggleProject(p.id)}
                      className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                    />
                    {p.name}
                  </label>
                ))
              )}
            </div>
          )}
          <p className="text-xs text-slate-400">
            {filterSelection.length === 0
              ? "No filter — you see all projects."
              : `${filterSelection.length} project${filterSelection.length !== 1 ? "s" : ""} selected.`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectFilterOpen(false)} disabled={savingFilters}>
              Cancel
            </Button>
            <Button onClick={saveFilters} disabled={savingFilters || loadingFilters}>
              {savingFilters ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
