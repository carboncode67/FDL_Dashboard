"use client";

import { useState } from "react";
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
import { KeyRound, LogOut, SlidersHorizontal } from "lucide-react";
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

interface FarmOption {
  id: number;
  name: string;
  project_ids: number[];
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
  const [filterOpen, setFilterOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [farmOptions, setFarmOptions] = useState<FarmOption[]>([]);
  const [projectSelection, setProjectSelection] = useState<number[]>([]);
  const [farmSelection, setFarmSelection] = useState<number[]>([]);
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const name = session?.user?.name || session?.user?.email || "User";
  const initials = name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  async function openFilters() {
    setFilterOpen(true);
    setLoading(true);
    try {
      const res = await fetch("/api/profile/project-filters");
      const data = await res.json();
      setProjects(data.projects ?? []);
      setFarmOptions(data.farm_options ?? []);
      setProjectSelection(data.project_ids ?? []);
      setFarmSelection(data.farm_ids ?? []);
      setShowUnassigned(data.show_unassigned ?? true);
    } finally {
      setLoading(false);
    }
  }

  function toggleProject(pid: number) {
    setProjectSelection((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
    );
  }

  function toggleFarm(fid: number) {
    setFarmSelection((prev) =>
      prev.includes(fid) ? prev.filter((id) => id !== fid) : [...prev, fid]
    );
  }

  async function saveFilters() {
    setSaving(true);
    try {
      await fetch("/api/profile/project-filters", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_ids: projectSelection,
          farm_ids: farmSelection,
          show_unassigned: showUnassigned,
        }),
      });
      setFilterOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  // Farms shown cascade from selected projects; if no projects selected, show all farms
  const visibleFarms =
    projectSelection.length > 0
      ? farmOptions.filter((f) => f.project_ids.some((pid) => projectSelection.includes(pid)))
      : farmOptions;

  const isFiltered = projectSelection.length > 0 || farmSelection.length > 0;

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
            <DropdownMenuItem onClick={openFilters} className="cursor-pointer">
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Dashboard Filters
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

      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dashboard Filters</DialogTitle>
            <DialogDescription>
              Filter what you see across the dashboard. Leave all unchecked to see everything.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="text-sm text-slate-500 py-4 text-center">Loading…</p>
          ) : (
            <div className="space-y-4 py-1">
              {/* Projects */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Projects</p>
                <div className="max-h-44 overflow-y-auto space-y-2">
                  {projects.length === 0 ? (
                    <p className="text-sm text-slate-400">No projects found.</p>
                  ) : (
                    projects.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={projectSelection.includes(p.id)}
                          onChange={() => toggleProject(p.id)}
                          className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                        />
                        {p.name}
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Farms — cascade from selected projects */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Farms
                  {projectSelection.length > 0 && (
                    <span className="ml-1 font-normal normal-case">(in selected projects)</span>
                  )}
                </p>
                <div className="max-h-44 overflow-y-auto space-y-2">
                  {visibleFarms.length === 0 ? (
                    <p className="text-sm text-slate-400">No farms found.</p>
                  ) : (
                    visibleFarms.map((f) => (
                      <label key={f.id} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={farmSelection.includes(f.id)}
                          onChange={() => toggleFarm(f.id)}
                          className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                        />
                        {f.name}
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Show unassigned toggle */}
              <div className="border-t border-slate-100 pt-3">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={showUnassigned}
                    onChange={(e) => setShowUnassigned(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                  />
                  Show unassigned data
                  <span className="text-xs text-slate-400">(uploads not yet matched to a farm)</span>
                </label>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-400">
            {!isFiltered
              ? "No filter active — you see all data."
              : [
                  projectSelection.length > 0 && `${projectSelection.length} project${projectSelection.length !== 1 ? "s" : ""}`,
                  farmSelection.length > 0 && `${farmSelection.length} farm${farmSelection.length !== 1 ? "s" : ""}`,
                ]
                  .filter(Boolean)
                  .join(", ") + " selected."}
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFilterOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveFilters} disabled={saving || loading}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
