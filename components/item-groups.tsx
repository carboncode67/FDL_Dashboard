"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDown, ArrowUp, Check, FolderTree, Pencil, Plus, Trash2, X } from "lucide-react";
import { MAX_GROUP_NAME_LENGTH, type ItemGroup, type ItemGroupKind } from "@/lib/item-group-types";

// List-page grouping UI for Forms and Sampling Maps (separate group lists per kind — see
// lib/item-groups.ts). ManageItemGroupsDialog creates/renames/reorders/deletes groups;
// ItemGroupSelect is the per-row "move to group" control.

async function errorFrom(res: Response, fallback: string): Promise<string> {
  const json = await res.json().catch(() => ({}));
  return json.error ?? fallback;
}

export function ManageItemGroupsDialog({
  kind,
  groups,
  itemLabel,
}: {
  kind: ItemGroupKind;
  groups: ItemGroup[];
  /** Plural noun for the description, e.g. "forms". */
  itemLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn: () => Promise<Response>, fallback: string): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      const res = await fn();
      if (!res.ok) {
        setError(await errorFrom(res, fallback));
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!newName.trim()) return;
    const ok = await run(
      () =>
        fetch(`/api/item-groups/${kind}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName }),
        }),
      "Failed to create group"
    );
    if (ok) setNewName("");
  }

  async function rename(id: number) {
    const ok = await run(
      () =>
        fetch(`/api/item-groups/${kind}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: editName }),
        }),
      "Failed to rename group"
    );
    if (ok) setEditingId(null);
  }

  function remove(id: number) {
    run(() => fetch(`/api/item-groups/${kind}/${id}`, { method: "DELETE" }), "Failed to delete group");
  }

  function move(index: number, delta: -1 | 1) {
    const ids = groups.map((g) => g.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(
      () =>
        fetch(`/api/item-groups/${kind}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        }),
      "Failed to reorder groups"
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { setOpen(true); setError(""); setEditingId(null); }}>
        <FolderTree className="h-4 w-4 mr-1" />
        Groups
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Groups</DialogTitle>
            <DialogDescription>
              Organise {itemLabel} into collapsible groups. Deleting a group moves its {itemLabel} to
              Ungrouped — nothing else is deleted.
            </DialogDescription>
          </DialogHeader>

          {groups.length === 0 ? (
            <p className="text-sm text-stone-400 py-2">No groups yet.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-stone-100">
              {groups.map((g, i) => (
                <li key={g.id} className="flex items-center justify-between gap-2 py-1.5">
                  {editingId === g.id ? (
                    <form
                      className="flex flex-1 items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        rename(g.id);
                      }}
                    >
                      <Input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={MAX_GROUP_NAME_LENGTH}
                        className="h-8"
                      />
                      <Button type="submit" size="icon-sm" variant="ghost" aria-label="Save name" disabled={busy}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </form>
                  ) : (
                    <>
                      <span className="text-sm text-stone-800 truncate">{g.name}</span>
                      <div className="flex items-center shrink-0">
                        <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)}>
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Move down"
                          disabled={busy || i === groups.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Rename ${g.name}`}
                          disabled={busy}
                          onClick={() => { setEditingId(g.id); setEditName(g.name); setError(""); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Delete ${g.name}`}
                          className="text-red-600 hover:text-red-700"
                          disabled={busy}
                          onClick={() => remove(g.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form
            className="flex gap-2 border-t border-stone-100 pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New group, e.g. Silage harvesting"
              maxLength={MAX_GROUP_NAME_LENGTH}
            />
            <Button type="submit" variant="outline" size="sm" disabled={busy || !newName.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </form>
          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const NO_GROUP = "none";

/** Per-row group picker. Wrapped in a click-stopping span: the Select popup is portaled, but
 *  React still bubbles its clicks through the component tree to the row's onClick. */
export function ItemGroupSelect({
  groups,
  value,
  updateUrl,
}: {
  groups: ItemGroup[];
  value: number | null;
  /** PUT endpoint accepting `{ group_id }`, e.g. /api/forms/12 */
  updateUrl: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function change(v: string | null) {
    const groupId = !v || v === NO_GROUP ? null : Number(v);
    if (groupId === value) return;
    setSaving(true);
    try {
      const res = await fetch(updateUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId }),
      });
      if (res.ok) router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <span onClick={(e) => e.stopPropagation()} className="inline-block">
      <Select value={value != null ? String(value) : NO_GROUP} onValueChange={change} disabled={saving}>
        <SelectTrigger size="sm" className="min-w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_GROUP} label="Ungrouped">
            Ungrouped
          </SelectItem>
          {groups.map((g) => (
            <SelectItem key={g.id} value={String(g.id)} label={g.name}>
              {g.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </span>
  );
}
