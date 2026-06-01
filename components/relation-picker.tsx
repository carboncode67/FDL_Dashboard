"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface RelationPickerProps {
  label: string;
  options: { id: number; name: string }[];
  apiPath: string;
}

export function RelationPicker({ label, options, apiPath }: RelationPickerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleLink() {
    if (!selected) return;
    setSaving(true);
    try {
      await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: parseInt(selected) }),
      });
      setOpen(false);
      setSelected("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={options.length === 0}>
        + Link {label}
      </Button>
      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); setSelected(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Link {label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Select value={selected} onValueChange={(v) => setSelected(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder={`Select a ${label}`} />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.id} value={String(o.id)} label={o.name}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setOpen(false); setSelected(""); }}>
                Cancel
              </Button>
              <Button onClick={handleLink} disabled={!selected || saving}>
                {saving ? "Linking..." : "Link"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
