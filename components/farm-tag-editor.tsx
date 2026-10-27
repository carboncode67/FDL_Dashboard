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
import { Plus, Tag } from "lucide-react";
import { FarmTagChip, FarmTagChips } from "@/components/farm-tag-chips";
import { MAX_TAG_NAME_LENGTH, type FarmTagOption } from "@/lib/farm-tags";

// Farm detail page header: the farm's tags plus an "Edit tags" dialog (pick existing tags,
// or type a new one). Open to every signed-in user — see PUT /api/farms/[id]/tags.
export function FarmTagEditor({ farmId, tags }: { farmId: number; tags: FarmTagOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [allTags, setAllTags] = useState<FarmTagOption[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function openEditor() {
    setOpen(true);
    setSelected(tags.map((t) => t.id));
    setNewName("");
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/farm-tags");
      if (res.ok) setAllTags(await res.json());
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function addTag() {
    if (!newName.trim()) return;
    setError("");
    const res = await fetch("/api/farm-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Failed to create tag");
      return;
    }
    const tag = json as FarmTagOption;
    setAllTags((prev) =>
      prev.some((t) => t.id === tag.id) ? prev : [...prev, tag].sort((a, b) => a.name.localeCompare(b.name))
    );
    setSelected((prev) => (prev.includes(tag.id) ? prev : [...prev, tag.id]));
    setNewName("");
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/farms/${farmId}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag_ids: selected }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to save tags");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      <FarmTagChips tags={tags} />
      <button
        type="button"
        onClick={openEditor}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-stone-300 px-2 py-0.5 text-xs text-stone-500 hover:text-stone-800 hover:border-stone-400"
      >
        <Tag className="h-3 w-3" />
        {tags.length === 0 ? "Add tags" : "Edit tags"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Farm Tags</DialogTitle>
            <DialogDescription>
              Tags let anyone hide or show groups of farms from Dashboard Filters.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="text-sm text-stone-500 py-4 text-center">Loading…</p>
          ) : (
            <div className="space-y-3">
              <div className="max-h-56 overflow-y-auto space-y-2">
                {allTags.length === 0 ? (
                  <p className="text-sm text-stone-400">No tags yet — create one below.</p>
                ) : (
                  allTags.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={selected.includes(t.id)}
                        onChange={() => toggle(t.id)}
                        className="h-4 w-4 rounded border-stone-300 accent-green-600"
                      />
                      <FarmTagChip tag={t} />
                    </label>
                  ))
                )}
              </div>
              <form
                className="flex gap-2 border-t border-stone-100 pt-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  addTag();
                }}
              >
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New tag, e.g. dairy"
                  maxLength={MAX_TAG_NAME_LENGTH}
                />
                <Button type="submit" variant="outline" size="sm" disabled={!newName.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </form>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || loading}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
