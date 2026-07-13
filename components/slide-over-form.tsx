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
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:w-[480px] data-[side=right]:sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="py-6">{children}</div>
        <SheetFooter className="sticky bottom-0 bg-popover border-t">
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
