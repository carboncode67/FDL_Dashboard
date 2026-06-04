"use client";

import { useState } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Send, MessageCircle, UserCheck, X } from "lucide-react";

const ONBOARDING_MESSAGE = `This number is monitored weekly — not suitable for urgent matters.

Welcome to the Farmers Datalab! Use this number to document your on-farm experiment — send observations, photos, voice notes, videos, soil reports, location pins, or any other field data.

Please avoid sending sensitive personal or financial information (IDs, banking details, passwords).

By using this service you acknowledge that WhatsApp and Twilio process messages as part of their infrastructure. We do not share your data with any other party.

Your participation is voluntary. Reply with your name to get started.`;

interface WhatsAppRow {
  id: number;
  name: string;
  phone: string;
  farm_name: string | null;
  farm_id: number | null;
  last_submission: string | null;
  days_since: number | null;
  token: string;
}

function LastSubmissionBadge({ days }: { days: number | null }) {
  if (days === null)
    return <Badge variant="destructive" className="text-xs">No submissions</Badge>;
  if (days === 0)
    return <Badge className="bg-emerald-100 text-emerald-800 text-xs">Today</Badge>;
  if (days <= 3)
    return <Badge className="bg-emerald-100 text-emerald-800 text-xs">{days}d ago</Badge>;
  if (days <= 7)
    return <Badge className="bg-amber-100 text-amber-800 text-xs">{days}d ago</Badge>;
  return <Badge variant="destructive" className="text-xs">{days}d ago</Badge>;
}

// Modal component for composing and sending a message
function MessageModal({
  farmer,
  initialMessage,
  onClose,
  onSent,
}: {
  farmer: WhatsAppRow;
  initialMessage: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [message, setMessage] = useState(initialMessage);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function handleSend() {
    if (!message.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: farmer.phone, message: message.trim() }),
      });
      if (res.ok) {
        onSent();
        onClose();
      } else {
        const err = await res.json();
        setError(err.error ?? "Failed to send message.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-slate-900">{farmer.name}</p>
            <p className="text-xs text-slate-500">{farmer.phone}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <textarea
          className="w-full border border-slate-200 rounded-lg p-3 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
          rows={12}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
        />

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Send className="h-4 w-4 mr-2" />
            {sending ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function WhatsAppClient({ data }: { data: WhatsAppRow[] }) {
  const [modal, setModal] = useState<{
    farmer: WhatsAppRow;
    message: string;
    isOnboarding?: boolean;
  } | null>(null);
  const [sentNotice, setSentNotice] = useState("");
  const [onboarded, setOnboarded] = useState<Set<number>>(new Set());

  function openCustomMessage(farmer: WhatsAppRow) {
    setModal({ farmer, message: "" });
  }

  function openOnboarding(farmer: WhatsAppRow) {
    setModal({ farmer, message: ONBOARDING_MESSAGE, isOnboarding: true });
  }

  function handleSent(farmerId?: number, wasOnboarding?: boolean) {
    setSentNotice("Message sent successfully.");
    setTimeout(() => setSentNotice(""), 4000);
    if (wasOnboarding && farmerId) {
      setOnboarded((prev) => new Set(prev).add(farmerId));
    }
  }

  const columns = [
    { key: "name", header: "Name" },
    { key: "phone", header: "Phone" },
    {
      key: "farm_name",
      header: "Farm",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as WhatsAppRow;
        return r.farm_name ?? <span className="text-slate-400">—</span>;
      },
    },
    {
      key: "days_since",
      header: "Last Submission",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as WhatsAppRow;
        return <LastSubmissionBadge days={r.days_since} />;
      },
    },
    {
      key: "_actions",
      header: "",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as WhatsAppRow;
        return (
          <div className="flex items-center gap-1">
            {onboarded.has(r.id) ? (
              <span className="inline-flex items-center gap-1 text-xs h-7 px-2 rounded border border-slate-200 text-slate-400 bg-slate-50">
                <UserCheck className="h-3 w-3" />
                Onboarded
              </span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 px-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                title="Send onboarding message"
                onClick={(e) => { e.stopPropagation(); openOnboarding(r); }}
              >
                <UserCheck className="h-3 w-3 mr-1" />
                Onboard
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              title="Send custom message"
              onClick={(e) => { e.stopPropagation(); openCustomMessage(r); }}
            >
              <MessageCircle className="h-4 w-4 text-slate-500" />
            </Button>
          </div>
        );
      },
    },
  ];

  const active   = data.filter((r) => r.days_since !== null && r.days_since <= 7).length;
  const inactive = data.filter((r) => r.days_since === null || r.days_since > 7).length;

  return (
    <div className="space-y-4">
      {sentNotice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-2 rounded-lg">
          {sentNotice}
        </div>
      )}

      <div className="flex gap-4">
        <div className="bg-white border border-slate-200 rounded-lg px-5 py-3">
          <div className="text-2xl font-semibold text-slate-900">{data.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">WhatsApp farmers</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-5 py-3">
          <div className="text-2xl font-semibold text-emerald-600">{active}</div>
          <div className="text-xs text-slate-500 mt-0.5">Active (last 7 days)</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-5 py-3">
          <div className="text-2xl font-semibold text-red-500">{inactive}</div>
          <div className="text-xs text-slate-500 mt-0.5">Inactive / no submissions</div>
        </div>
      </div>

      <DataTable
        title="WhatsApp Farmers"
        data={data as unknown as Record<string, unknown>[]}
        columns={columns}
        searchKeys={["name", "phone", "farm_name"]}
      />

      {modal && (
        <MessageModal
          farmer={modal.farmer}
          initialMessage={modal.message}
          onClose={() => setModal(null)}
          onSent={() => handleSent(modal.farmer.id, modal.isOnboarding)}
        />
      )}
    </div>
  );
}
