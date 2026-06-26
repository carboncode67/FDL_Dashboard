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

export function UserRolesTable({ users, currentUserId, canDelete, projects }: UserRolesTableProps) {
  const [rows, setRows] = useState(users);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<string | null>(null);

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
    try {
      await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      setRows((prev) => prev.filter((u) => u.id !== userId));
    } finally {
      setDeletingId(null);
      setConfirmOpen(null);
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
            <TableHead>Role</TableHead>
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
              <TableCell className="text-slate-500">{user.position ?? "—"}</TableCell>
              <TableCell>
                {user.has_token ? (
                  <Badge variant="default" className="gap-1">
                    <Smartphone className="h-3 w-3" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-slate-400">None</Badge>
                )}
              </TableCell>
              <TableCell>
                <select
                  value={user.role}
                  disabled={savingId === user.id || user.id === currentUserId}
                  onChange={(e) => handleRoleChange(user.id, e.target.value)}
                  className="text-sm border border-slate-200 rounded px-2 py-1 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </option>
                  ))}
                </select>
                {user.id === currentUserId && (
                  <span className="ml-2 text-xs text-slate-400">(you)</span>
                )}
              </TableCell>
              <TableCell>
                <button
                  onClick={() => openFilterDialog(user)}
                  className="text-sm"
                >
                  {user.project_filter_ids.length === 0 ? (
                    <Badge variant="outline" className="text-slate-400 cursor-pointer hover:border-slate-400">
                      All Projects
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="cursor-pointer">
                      {user.project_filter_ids.length} project{user.project_filter_ids.length !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </button>
              </TableCell>
              <TableCell className="text-slate-500 text-xs">
                {new Date(user.createdAt).toLocaleDateString()}
              </TableCell>
              {canDelete && (
                <TableCell>
                  {user.id !== currentUserId && (
                    <Dialog
                      open={confirmOpen === user.id}
                      onOpenChange={(o) => setConfirmOpen(o ? user.id : null)}
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
            <DialogTitle>Project Filter — {filterUser?.name ?? filterUser?.email}</DialogTitle>
            <DialogDescription>
              Select which projects this user sees in Data Sorting. Leave all unchecked to show
              data from every project.
            </DialogDescription>
          </DialogHeader>
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
          <p className="text-xs text-slate-400">
            {filterSelection.length === 0
              ? "No filter — user sees all projects."
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
