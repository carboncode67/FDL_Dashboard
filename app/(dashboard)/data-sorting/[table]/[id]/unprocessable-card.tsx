"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dataProductLabel } from "@/lib/data-products";

export interface GapInfo {
  id: number;
  status: "open" | "dismissed" | "resolved";
  data_product: string;
  /** The agent's observation text — agent-authored, rendered as plain text only. */
  description: string | null;
  confidence: number | null;
  decision_note: string | null;
  decided_at: string | null;
}

/**
 * "Unprocessable data" flag on the Data Sorting detail page (migration 102).
 * Dismiss = one-off data that will never need a tool. "Never flag this type"
 * (admins) adds a lab-wide ignore and dismisses every open flag of the type.
 */
export default function UnprocessableCard({
  gap,
  canDecide,
  canIgnoreType,
}: {
  gap: GapInfo;
  canDecide: boolean;
  canIgnoreType: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = dataProductLabel(gap.data_product);

  async function send(url: string, body: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? "Request failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (gap.status === "resolved") {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 mb-4 text-sm text-emerald-800">
        Was flagged as unprocessable ({label}); a processing tool now covers it.
      </div>
    );
  }

  if (gap.status === "dismissed") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-4 py-2 mb-4 text-sm text-stone-600">
        <span>
          Unprocessable-data flag dismissed ({label})
          {gap.decision_note ? `: ${gap.decision_note}` : ""}.
        </span>
        {canDecide && (
          <button
            className="ml-auto text-xs text-stone-500 hover:underline disabled:opacity-50"
            disabled={busy}
            onClick={() => send(`/api/processing-gaps/${gap.id}`, { action: "reopen" })}
          >
            Re-open
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 mb-4 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
        <span className="text-sm font-medium text-rose-800">
          Unprocessable data: looks like a {label.toLowerCase()}, and no processing tool covers it.
        </span>
      </div>
      {gap.description && (
        <p className="text-xs text-rose-900/80 whitespace-pre-wrap break-words">
          Agent observation{gap.confidence != null ? ` (${Math.round(gap.confidence * 100)}% sure)` : ""}:{" "}
          {gap.description}
        </p>
      )}
      <p className="text-xs text-rose-900/70">
        Add a pipeline that matches this upload to clear the flag, or dismiss it if this is one-off data.
      </p>
      {canDecide && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason (optional)"
            className="h-8 w-56 bg-white"
            maxLength={500}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => send(`/api/processing-gaps/${gap.id}`, { action: "dismiss", note })}
          >
            Dismiss
          </Button>
          {canIgnoreType && gap.data_product !== "none" && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              title="Lab-wide: dismisses every open flag of this type and never flags it again"
              onClick={() => send("/api/processing-gaps/ignores", { data_product: gap.data_product, note })}
            >
              Never flag “{label}”
            </Button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
