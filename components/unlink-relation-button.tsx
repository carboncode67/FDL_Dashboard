"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Generic counterpart to RelationPicker (components/relation-picker.tsx) — a small "Unlink"
// action for a many-to-many relation row, given the full DELETE url (including its query
// string) up front rather than assembling it from separate id props, so it works the same for
// any junction-table relation (e.g. /api/farms/[id]/projects?projectId=X,
// /api/projects/[id]/farms?farmId=X) without a new component per relation.
export function UnlinkRelationButton({ deletePath }: { deletePath: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleUnlink() {
    setLoading(true);
    try {
      await fetch(deletePath, { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={handleUnlink} disabled={loading} className="text-red-600 hover:text-red-700 hover:bg-red-50">
      {loading ? "Unlinking…" : "Unlink"}
    </Button>
  );
}
