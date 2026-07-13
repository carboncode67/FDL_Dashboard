"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Sidebar } from "@/components/sidebar";
import type { Role } from "@/lib/roles";

export function MobileNav({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden -ml-2 rounded-md p-2 text-slate-600 hover:bg-slate-100 transition-colors"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="data-[side=left]:w-60 data-[side=left]:sm:max-w-none gap-0 overflow-y-auto"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar
            role={role}
            className="min-h-full w-full"
            onNavigate={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
