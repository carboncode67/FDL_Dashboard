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
import { Check, Pencil, Tags, Trash2, X } from "lucide-react";
import { FarmTagChip } from "@/components/farm-tag-chips";
import { MAX_TAG_NAME_LENGTH } from "@/lib/farm-tags";

interface TagRow {
  id: number;
  name: string;
  farm_count: number;
}

// Farms list: rename/delete tags lab-wide. Rename needs canEdit, delete needs canDelete
// (Edit Mode for members) — the same rules the API enforces; creating/applying tags is done
// per farm from the farm page.
export function ManageFarmTagsDialog({ canRename, canRemove }: { canRename: boolean; canRemove: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/farm-tags");
      if (res.ok) setTags(await res.json());
    } finally {
      setLoading(false);
    }
  }

  function openDialog() {
    setOpen(true);
    setEditingId(null);
    setError("");
    setChanged(false);
    load();
  }

  function close(v: boolean) {
    setOpen(v);
    if (!v && changed) router.refresh();
  }

  async function rename(id: number) {
    setError("");
    const res = await fetch(`/api/farm-tags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to rename tag");
      return;
    }
    setEditingId(null);
    setChanged(true);
    load();
  }

  async function remove(tag: TagRow) {
    setError("");
    const res = await fetch(`/api/farm-tags/${tag.id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to delete tag");
      return;
    }
    setChanged(true);
    load();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog}>
        <Tags className="h-4 w-4 mr-1" />
        Manage tags
      </Button>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Farm Tags</DialogTitle>
            <DialogDescription>
              Add tags to a farm from its page. Renaming or deleting a tag here affects every farm
              that has it{canRemove ? "" : " — deleting requires Edit Mode"}.
            </DialogDescription>
          </DialogHeader>

          {loading && tags.length === 0 ? (
            <p className="text-sm text-stone-500 py-4 text-center">Loading…</p>
          ) : tags.length === 0 ? (
            <p className="text-sm text-stone-400 py-4 text-center">No tags yet.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-stone-100">
              {tags.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                  {editingId === t.id ? (
                    <form
                      className="flex flex-1 items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        rename(t.id);
                      }}
                    >
                      <Input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={MAX_TAG_NAME_LENGTH}
                        className="h-8"
                      />
                      <Button type="submit" size="icon-sm" variant="ghost" aria-label="Save name">
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </form>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 min-w-0">
                        <FarmTagChip tag={t} />
                        <span className="text-xs text-stone-400">
                          {t.farm_count} farm{t.farm_count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {canRename && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Rename ${t.name}`}
                            onClick={() => {
                              setEditingId(t.id);
                              setEditName(t.name);
                              setError("");
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canRemove && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Delete ${t.name}`}
                            className="text-red-600 hover:text-red-700"
                            onClick={() => remove(t)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
