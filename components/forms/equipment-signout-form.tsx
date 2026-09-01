"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SlideOverForm } from "@/components/slide-over-form";
import { X } from "lucide-react";

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export interface SignoutContact {
  id: number;
  name: string;
  phone: string | null;
}

interface EquipmentSignoutFormProps {
  open: boolean;
  onClose: () => void;
  droneId: number;
  droneName: string | null;
  contacts: SignoutContact[];
}

export function EquipmentSignoutForm({ open, onClose, droneId, droneName, contacts }: EquipmentSignoutFormProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [contact, setContact] = useState<SignoutContact | null>(null);
  const [signedOutAt, setSignedOutAt] = useState(todayISODate());
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return contacts.filter((c) => [c.name, c.phone].filter(Boolean).join(" ").toLowerCase().includes(q)).slice(0, 8);
  }, [contacts, search]);

  function reset() {
    setSearch("");
    setContact(null);
    setSignedOutAt(todayISODate());
    setDueAt("");
    setError(null);
  }

  async function handleSave() {
    if (!contact && !dueAt) {
      setError("Select a farmer and a due-by date.");
      return;
    }
    if (!contact) {
      setError("Select a farmer.");
      return;
    }
    if (!dueAt) {
      setError("Select a due-by date.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/drones/${droneId}/loans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contact.id,
          signed_out_at: signedOutAt,
          due_at: dueAt,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to sign out equipment.");
        return;
      }
      router.refresh();
      reset();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <SlideOverForm
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Sign Out Equipment"
      description={droneName ? `Sign out "${droneName}" on behalf of a farmer.` : "Sign out this item on behalf of a farmer."}
      onSave={handleSave}
      saving={saving}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Farmer</Label>
          {contact ? (
            <div className="flex items-center justify-between rounded-md border border-input px-3 py-2 text-sm">
              <span>{contact.name}</span>
              <button
                type="button"
                onClick={() => setContact(null)}
                className="text-slate-400 hover:text-red-500"
                aria-label="Change farmer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search farmers by name or phone..."
              />
              {matches.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-md max-h-56 overflow-y-auto">
                  {matches.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => { setContact(c); setSearch(""); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.phone && <span className="text-slate-400 ml-2">{c.phone}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Signed Out</Label>
            <Input type="date" value={signedOutAt} onChange={(e) => setSignedOutAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Due Back</Label>
            <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} required />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </SlideOverForm>
  );
}
