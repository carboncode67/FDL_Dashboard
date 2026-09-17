"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Smartphone } from "lucide-react";

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
  category: string;
  is_service_account: boolean;
  position: string | null;
  has_token: boolean;
  createdAt: Date;
  project_filter_ids: number[];
}

interface ProjectOption {
  id: number;
  name: string;
}

interface UserRolesTableProps {
  users: UserRow[];
  currentUserId: string;
  canDelete: boolean;
  projects: ProjectOption[];
}

const ROLES = ["admin", "member", "viewer"] as const;
const CATEGORIES = [
  { value: "lab_member", label: "Lab Member" },
  { value: "agronomist", label: "Agronomist" },
] as const;

export function UserRolesTable({ users, currentUserId, canDelete, projects }: UserRolesTableProps) {
  const [rows, setRows] = useState(users);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Project filter dialog state
  const [filterDialogUserId, setFilterDialogUserId] = useState<string | null>(null);
  const [filterSelection, setFilterSelection] = useState<number[]>([]);
  const [savingFilters, setSavingFilters] = useState(false);

  function openFilterDialog(user: UserRow) {
    setFilterSelection(user.project_filter_ids);
    setFilterDialogUserId(user.id);
  }

  function toggleProject(pid: number) {
    setFilterSelection((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
    );
  }

  async function saveFilters() {
    if (!filterDialogUserId) return;
    setSavingFilters(true);
    try {
      const res = await fetch(`/api/admin/users/${filterDialogUserId}/project-filters`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_ids: filterSelection }),
      });
      if (res.ok) {
        const saved = [...filterSelection];
        setRows((prev) =>
          prev.map((u) =>
            u.id === filterDialogUserId ? { ...u, project_filter_ids: saved } : u
          )
        );
        setFilterDialogUserId(null);
      }
    } finally {
      setSavingFilters(false);
    }
  }

  async function handleDelete(userId: string) {
    setDeletingId(userId);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDeleteError(body.error ?? "Failed to delete user.");
        return;
      }
      setRows((prev) => prev.filter((u) => u.id !== userId));
      setConfirmOpen(null);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    setSavingId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        setRows((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
        );
      }
    } finally {
      setSavingId(null);
    }
  }

  async function handleCategoryChange(userId: string, newCategory: string) {
    setSavingId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: newCategory }),
      });
      if (res.ok) {
        setRows((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, category: newCategory } : u))
        );
      }
    } finally {
      setSavingId(null);
    }
  }

  async function handleServiceAccountChange(userId: string, isService: boolean) {
    setSavingId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_service_account: isService }),
      });
      if (res.ok) {
        setRows((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, is_service_account: isService } : u))
        );
      }
    } finally {
      setSavingId(null);
    }
  }

  const filterUser = rows.find((u) => u.id === filterDialogUserId);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Position</TableHead>
            <TableHead>App Access</TableHead>
            <TableHead>Token Scope</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Project Filter</TableHead>
            <TableHead>Joined</TableHead>
            {canDelete && <TableHead></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.name ?? "—"}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell className="text-stone-500">{user.position ?? "—"}</TableCell>
              <TableCell>
                {user.has_token ? (
                  <Badge variant="default" className="gap-1">
                    <Smartphone className="h-3 w-3" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-stone-400">None</Badge>
                )}
              </TableCell>
              <TableCell>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer" title="Service integrations (OFE Dashboard sync, Client tools, PipelineProcessor) keep full API access. Everyone else's token — including every mobile app QR code — is restricted to uploading plus pulling assigned forms/maps/geofences.">
                  <input
                    type="checkbox"
                    checked={user.is_service_account}
                    disabled={savingId === user.id}
                    onChange={(e) => handleServiceAccountChange(user.id, e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-stone-300 accent-green-600"
                  />
                  {user.is_service_account ? (
                    <Badge variant="secondary">Service (full access)</Badge>
                  ) : (
                    <Badge variant="outline" className="text-stone-400">Restricted</Badge>
                  )}
                </label>
              </TableCell>
              <TableCell>
                <select
                  value={user.role}
                  disabled={savingId === user.id || user.id === currentUserId}
                  onChange={(e) => handleRoleChange(user.id, e.target.value)}
                  className="text-sm border border-stone-200 rounded px-2 py-1 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </option>
                  ))}
                </select>
                {user.id === currentUserId && (
                  <span className="ml-2 text-xs text-stone-400">(you)</span>
                )}
              </TableCell>
              <TableCell>
                <select
                  value={user.category}
                  disabled={savingId === user.id}
                  onChange={(e) => handleCategoryChange(user.id, e.target.value)}
                  className="text-sm border border-stone-200 rounded px-2 py-1 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </TableCell>
              <TableCell>
                <button
                  onClick={() => openFilterDialog(user)}
                  className="text-sm"
                >
                  {user.category === "agronomist" ? (
                    user.project_filter_ids.length === 0 ? (
                      <Badge variant="destructive" className="cursor-pointer">
                        No access yet
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="cursor-pointer">
                        {user.project_filter_ids.length} assigned
                      </Badge>
                    )
                  ) : user.project_filter_ids.length === 0 ? (
                    <Badge variant="outline" className="text-stone-400 cursor-pointer hover:border-stone-400">
                      All Projects
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="cursor-pointer">
                      {user.project_filter_ids.length} project{user.project_filter_ids.length !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </button>
              </TableCell>
              <TableCell className="text-stone-500 text-xs">
                {new Date(user.createdAt).toLocaleDateString()}
              </TableCell>
              {canDelete && (
                <TableCell>
                  {user.id !== currentUserId && (
                    <Dialog
                      open={confirmOpen === user.id}
                      onOpenChange={(o) => { setConfirmOpen(o ? user.id : null); setDeleteError(null); }}
                    >
                      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
                        Delete
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Delete user?</DialogTitle>
                          <DialogDescription>
                            This will permanently delete{" "}
                            <strong>{user.name ?? user.email}</strong> and revoke their
                            dashboard access. This cannot be undone.
                          </DialogDescription>
                        </DialogHeader>
                        {confirmOpen === user.id && deleteError && (
                          <p className="text-sm text-red-600">{deleteError}</p>
                        )}
                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => setConfirmOpen(null)}
                            disabled={deletingId === user.id}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => handleDelete(user.id)}
                            disabled={deletingId === user.id}
                          >
                            {deletingId === user.id ? "Deleting…" : "Delete"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Project filter dialog */}
      <Dialog
        open={filterDialogUserId !== null}
        onOpenChange={(o) => { if (!o) setFilterDialogUserId(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {filterUser?.category === "agronomist" ? "Assigned Projects" : "Project Filter"} —{" "}
              {filterUser?.name ?? filterUser?.email}
            </DialogTitle>
            <DialogDescription>
              {filterUser?.category === "agronomist"
                ? "This is an Agronomist — a hard restriction, not a personal preference. They can only see farms, fields, experiments, tasks, contacts and uploads under the project(s) checked below (and can't change this themselves). Leave all unchecked and they see nothing."
                : "Select which projects this user sees in Data Sorting. Leave all unchecked to show data from every project."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto space-y-2 py-1">
            {projects.length === 0 ? (
              <p className="text-sm text-stone-500">No projects found.</p>
            ) : (
              projects.map((p) => (
                <label key={p.id} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={filterSelection.includes(p.id)}
                    onChange={() => toggleProject(p.id)}
                    className="h-4 w-4 rounded border-stone-300 accent-green-600"
                  />
                  {p.name}
                </label>
              ))
            )}
          </div>
          <p className="text-xs text-stone-400">
            {filterSelection.length === 0
              ? filterUser?.category === "agronomist"
                ? "No projects assigned — they will see nothing until you select at least one."
                : "No filter — user sees all projects."
              : `${filterSelection.length} project${filterSelection.length !== 1 ? "s" : ""} selected.`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFilterDialogUserId(null)} disabled={savingFilters}>
              Cancel
            </Button>
            <Button onClick={saveFilters} disabled={savingFilters}>
              {savingFilters ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
