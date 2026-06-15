"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function UnlinkExperimentButton({
  projectId,
  experimentId,
}: {
  projectId: number;
  experimentId: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleUnlink() {
    setLoading(true);
    try {
      await fetch(`/api/projects/${projectId}/experiments?experimentId=${experimentId}`, {
        method: "DELETE",
      });
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
