"use client";

import { useState } from "react";
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

const DEFAULT_MESSAGE = `Welcome to the FarmerDataLogger app!

Scan the attached QR code from within the app to connect your account and start uploading field data.

If you have any questions, reach out to the lab.`;

export function SendOnboardingEmailButton({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSend() {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/lab-members/${userId}/send-onboarding-email`, {
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
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
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
