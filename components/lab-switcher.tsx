"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Building2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface LabOption {
  id: number;
  name: string;
  slug: string;
}

interface LabSwitcherProps {
  labs: LabOption[];
  activeLabSlug: string | null;
  homeLabSlug: string | null;
  activeLabName: string;
}

export function LabSwitcher({ labs, activeLabSlug, homeLabSlug, activeLabName }: LabSwitcherProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function selectLab(slug: string | null) {
    setPending(true);
    try {
      await fetch("/api/platform/active-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const isViewingOtherLab = !!activeLabSlug && activeLabSlug !== homeLabSlug;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className={cn(
          "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold outline-none border",
          isViewingOtherLab
            ? "bg-amber-100 text-amber-800 border-amber-200"
            : "bg-emerald-100 text-emerald-800 border-emerald-200"
        )}
      >
        <Building2 className="h-3.5 w-3.5" />
        {activeLabName}
        <ChevronDown className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-slate-500">
          Platform admin — view as lab
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {labs.map((lab) => (
          <DropdownMenuItem
            key={lab.id}
            className="cursor-pointer justify-between"
            onClick={() => selectLab(lab.slug === homeLabSlug ? null : lab.slug)}
          >
            {lab.name}
            {(activeLabSlug ?? homeLabSlug) === lab.slug && (
              <span className="text-xs text-emerald-600">Active</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
