"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Smartphone } from "lucide-react";

export function GenerateTokenButton({ contactId }: { contactId: number }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleGenerate() {
    setLoading(true);
    await fetch(`/api/contacts/${contactId}/token`, { method: "POST" });
    router.refresh();
    setLoading(false);
  }

  return (
    <Button onClick={handleGenerate} disabled={loading} size="sm">
      <Smartphone className="h-4 w-4 mr-2" />
      {loading ? "Generating…" : "Generate Token"}
    </Button>
  );
}
