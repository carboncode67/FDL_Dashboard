"use client";

import { useState } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Send, MessageCircle } from "lucide-react";

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

export function WhatsAppClient({ data }: { data: WhatsAppRow[] }) {
  const [sending, setSending] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  async function sendMessage(contactId: number, phone: string, text: string) {
    setSending(contactId);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message: text }),
      });
      if (res.ok) {
        alert("Message sent successfully.");
      } else {
        const err = await res.json();
        alert(`Failed to send: ${err.error ?? "Unknown error"}`);
      }
    } catch (e) {
      alert("Network error sending message.");
    } finally {
      setSending(null);
      setMessage("");
      setSelectedId(null);
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
        const isSelected = selectedId === r.id;
        return (
          <div className="flex items-center gap-2">
            {isSelected ? (
              <>
                <input
                  className="border rounded px-2 py-1 text-xs w-48"
                  placeholder="Type message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
                <Button
                  size="icon-sm"
                  variant="default"
                  disabled={!message.trim() || sending === r.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    sendMessage(r.id, r.phone, message.trim());
                  }}
                >
                  <Send className="h-3 w-3" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(null);
                    setMessage("");
                  }}
                >
                  ✕
                </Button>
              </>
            ) : (
              <Button
                size="icon-sm"
                variant="ghost"
                title="Send WhatsApp message"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(r.id);
                }}
              >
                <MessageCircle className="h-4 w-4 text-green-600" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  // Summary stats
  const active = data.filter((r) => r.days_since !== null && r.days_since <= 7).length;
  const inactive = data.filter((r) => r.days_since === null || r.days_since > 7).length;

  return (
    <div className="space-y-4">
      {/* Summary row */}
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
    </div>
  );
}
