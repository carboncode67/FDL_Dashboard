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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Mail } from "lucide-react";

export function SendOnboardingEmailButton({
  contactId,
  email,
  initialMessage,
}: {
  contactId: number;
  email: string | null;
  initialMessage: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSend() {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/contacts/${contactId}/send-onboarding-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Failed to send email.");
        return;
      }
      setSent(true);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (!email) {
    return (
      <p className="text-xs text-slate-400">Add an email address to send an onboarding email.</p>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) { setError(""); setSent(false); }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Mail className="h-4 w-4 mr-2" />
        Send Onboarding Email
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send onboarding email</DialogTitle>
          <DialogDescription>
            Sends a custom message to <strong>{email}</strong> with the QR code above attached as an image.
          </DialogDescription>
        </DialogHeader>
        <textarea
          className="w-full border border-slate-200 rounded-lg p-3 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
          rows={10}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={sending}
        />
        <p className="text-xs text-slate-400">
          Tip: <code>[link text](https://example.com)</code> becomes a clickable link.
        </p>
        {error && <p className="text-xs text-red-500">{error}</p>}
        {sent && <p className="text-xs text-emerald-600">Sent!</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
            Close
          </Button>
          <Button onClick={handleSend} disabled={sending || !message.trim()}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
