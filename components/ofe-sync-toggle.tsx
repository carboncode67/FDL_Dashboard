"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function OfeSyncToggle({
  farmId,
  enabled,
}: {
  farmId: number;
  enabled: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    await fetch(`/api/farms/${farmId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ofe_sync_enabled: !enabled }),
    });
    setLoading(false);
    router.refresh();
  }

  if (enabled) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary">OFE Sync Enabled</Badge>
        <Button variant="outline" size="sm" onClick={toggle} disabled={loading}>
          {loading ? "Disabling…" : "Disable OFE Sync"}
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={toggle} disabled={loading}>
      {loading ? "Enabling…" : "Enable OFE Sync"}
    </Button>
  );
}
