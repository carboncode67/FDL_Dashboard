"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Smartphone } from "lucide-react";

export function GrantAccessButton({ memberId }: { memberId: number }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleGrant() {
    setLoading(true);
    await fetch(`/api/lab-members/${memberId}/token`, { method: "POST" });
    router.refresh();
    setLoading(false);
  }

  return (
    <Button onClick={handleGrant} disabled={loading} size="sm">
      <Smartphone className="h-4 w-4 mr-2" />
      {loading ? "Generating…" : "Grant App Access"}
    </Button>
  );
}
