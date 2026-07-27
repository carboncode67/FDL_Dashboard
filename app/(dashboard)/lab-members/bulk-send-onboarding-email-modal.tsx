"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

const DEFAULT_MESSAGE = `Welcome to the FarmerDataLogger app!

Scan the attached QR code from within the app to connect your account and start uploading field data.

If you have any questions, reach out to the lab.`;

interface Recipient {
  id: string;
  name: string;
}

type SendStatus = "sending" | "sent" | "error";

export function BulkSendOnboardingEmailModal({
  open,
  recipients,
  onClose,
  onDone,
}: {
  open: boolean;
  recipients: Recipient[];
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [sending, setSending] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, { status: SendStatus; error?: string }>>({});

  async function handleSend() {
    setSending(true);
    setStatuses({});

    for (const r of recipients) {
      setStatuses((prev) => ({ ...prev, [r.id]: { status: "sending" } }));
      try {
        const res = await fetch(`/api/lab-members/${r.id}/send-onboarding-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });
        if (res.ok) {
          setStatuses((prev) => ({ ...prev, [r.id]: { status: "sent" } }));
        } else {
          const err = await res.json().catch(() => ({}));
          setStatuses((prev) => ({ ...prev, [r.id]: { status: "error", error: err.error ?? "Failed" } }));
        }
      } catch {
        setStatuses((prev) => ({ ...prev, [r.id]: { status: "error", error: "Network error" } }));
      }
      // Small pause between sends — a steady trickle looks far less like
      // automated/bulk traffic to Gmail than a burst, which matters most
      // right after the sending account's spam-reputation warm-up.
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    setSending(false);
    onDone();
    router.refresh();
  }

  const doneCount = Object.values(statuses).filter((s) => s.status === "sent" || s.status === "error").length;
  const allDone = doneCount > 0 && doneCount === recipients.length && !sending;
  const sentCount = Object.values(statuses).filter((s) => s.status === "sent").length;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !sending) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Send onboarding email to {recipients.length} member{recipients.length !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Each recipient gets this message with their own QR code attached, sent one at a time.
          </DialogDescription>
        </DialogHeader>

        <textarea
          className="w-full border border-slate-200 rounded-lg p-3 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
          rows={8}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={sending || doneCount > 0}
        />

        {Object.keys(statuses).length > 0 && (
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-48 overflow-y-auto">
            {recipients.map((r) => {
              const s = statuses[r.id];
              return (
                <div key={r.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                  <span className="truncate">{r.name}</span>
                  {s?.status === "sending" && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                  {s?.status === "sent" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                  {s?.status === "error" && (
                    <span className="flex items-center gap-1 text-red-500 text-xs">
                      <XCircle className="h-3.5 w-3.5" /> {s.error}
                    </span>
                  )}
                  {!s && <span className="text-slate-300 text-xs">Waiting…</span>}
                </div>
              );
            })}
          </div>
        )}

        {allDone && (
          <p className="text-xs text-slate-500">
            Sent to {sentCount} of {recipients.length}.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            {allDone ? "Close" : "Cancel"}
          </Button>
          {!allDone && (
            <Button onClick={handleSend} disabled={sending || !message.trim()}>
              {sending ? `Sending ${doneCount + 1} of ${recipients.length}…` : "Send"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
