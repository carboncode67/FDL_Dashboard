"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

interface SlideOverFormProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  onSave?: () => void;
  saving?: boolean;
}

export function SlideOverForm({
  open,
  onClose,
  title,
  description,
  children,
  onSave,
  saving = false,
}: SlideOverFormProps) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[480px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="py-6">{children}</div>
        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {onSave && (
            <Button onClick={onSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
