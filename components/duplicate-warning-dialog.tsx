"use client";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface DuplicateMatch {
  id: number | string;
  name: string;
}

interface DuplicateWarningDialogProps {
  open: boolean;
  entityLabel: string;
  duplicates: DuplicateMatch[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function DuplicateWarningDialog({
  open,
  entityLabel,
  duplicates,
  onConfirm,
  onCancel,
}: DuplicateWarningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Similar {entityLabel} Found</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {duplicates.length === 1 ? "An existing entry has" : "Existing entries have"} a very similar name:
        </p>
        <ul className="space-y-1 my-1">
          {duplicates.map((d) => (
            <li
              key={d.id}
              className="text-sm font-medium px-2 py-1.5 bg-amber-50 border border-amber-200 rounded"
            >
              {d.name}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Create a new {entityLabel.toLowerCase()} anyway?
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm}>Create Anyway</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export async function checkDuplicates(
  entity: string,
  name: string
): Promise<DuplicateMatch[]> {
  if (!name.trim()) return [];
  const res = await fetch(
    `/api/duplicates?entity=${encodeURIComponent(entity)}&name=${encodeURIComponent(name.trim())}`
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.duplicates ?? [];
}
