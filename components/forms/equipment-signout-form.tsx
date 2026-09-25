"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SlideOverForm } from "@/components/slide-over-form";
import { cn } from "@/lib/utils";

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export interface SignoutContact {
  id: number;
  name: string;
  phone: string | null;
}

export interface SignoutUser {
  id: string;
  name: string | null;
  email: string;
  category: string;
}

type RenterKind = "farmer" | "lab_member" | "agronomist";

const KIND_LABELS: Record<RenterKind, string> = {
  farmer: "Farmer",
  lab_member: "Lab Member",
  agronomist: "Agronomist",
};

interface EquipmentSignoutFormProps {
  open: boolean;
  onClose: () => void;
  droneId: number;
  droneName: string | null;
  contacts: SignoutContact[];
  users: SignoutUser[];
}

export function EquipmentSignoutForm({ open, onClose, droneId, droneName, contacts, users }: EquipmentSignoutFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [kind, setKind] = useState<RenterKind>("farmer");
  const [renterId, setRenterId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [signedOutAt, setSignedOutAt] = useState(todayISODate());
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const optionsByKind: Record<RenterKind, { value: string; label: string }[]> = useMemo(
    () => ({
      farmer: contacts.map((c) => ({ value: String(c.id), label: c.phone ? `${c.name} (${c.phone})` : c.name })),
      lab_member: users
        .filter((u) => u.category === "lab_member")
        .map((u) => ({ value: u.id, label: u.name ?? u.email })),
      agronomist: users
        .filter((u) => u.category === "agronomist")
        .map((u) => ({ value: u.id, label: u.name ?? u.email })),
    }),
    [contacts, users]
  );

  function reset() {
    setMode("existing");
    setKind("farmer");
    setRenterId("");
    setNewName("");
    setNewEmail("");
    setNewPhone("");
    setSignedOutAt(todayISODate());
    setDueAt("");
    setError(null);
  }

  async function handleSave() {
    if (!dueAt) {
      setError("Select a due-by date.");
      return;
    }
    if (mode === "existing" && !renterId) {
      setError("Select a person to sign out to.");
      return;
    }
    if (mode === "new" && !newName.trim()) {
      setError("Enter a name for the new person.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      let contact_id: number | null = null;
      let renter_user_id: string | null = null;

      if (mode === "new") {
        const res = await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName.trim(), email: newEmail.trim() || null, phone: newPhone.trim() || null }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Failed to create person.");
          return;
        }
        const created = await res.json();
        contact_id = created.id;
      } else if (kind === "farmer") {
        contact_id = parseInt(renterId);
      } else {
        renter_user_id = renterId;
      }

      const res = await fetch(`/api/drones/${droneId}/loans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id,
          renter_user_id,
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

  const selectClass = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";
  const tabClass = (active: boolean) =>
    cn(
      "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      active ? "bg-white shadow-sm" : "text-stone-500 hover:text-stone-700"
    );

  return (
    <SlideOverForm
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Sign Out Equipment"
      description={droneName ? `Sign out "${droneName}" on behalf of a farmer, lab member, or agronomist.` : "Sign out this item."}
      onSave={handleSave}
      saving={saving}
    >
      <div className="space-y-4">
        <div className="flex gap-1 rounded-md bg-stone-100 p-1">
          <button type="button" className={tabClass(mode === "existing")} onClick={() => setMode("existing")}>
            Select Person
          </button>
          <button type="button" className={tabClass(mode === "new")} onClick={() => setMode("new")}>
            Add New Person
          </button>
        </div>

        {mode === "existing" ? (
          <div className="space-y-1.5">
            <Label>Sign Out To</Label>
            <div className="flex gap-2">
              <select
                className={cn(selectClass, "w-36 shrink-0")}
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as RenterKind);
                  setRenterId("");
                }}
              >
                {(Object.keys(KIND_LABELS) as RenterKind[]).map((k) => (
                  <option key={k} value={k}>{KIND_LABELS[k]}</option>
                ))}
              </select>
              <select className={selectClass} value={renterId} onChange={(e) => setRenterId(e.target.value)}>
                <option value="">— select —</option>
                {optionsByKind[kind].map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {optionsByKind[kind].length === 0 && (
              <p className="text-xs text-stone-400 italic">No {KIND_LABELS[kind].toLowerCase()}s found.</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Optional" />
              </div>
            </div>
          </div>
        )}

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
