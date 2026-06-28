"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DuplicateWarningDialog, checkDuplicates, type DuplicateMatch } from "@/components/duplicate-warning-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FarmOption {
  id: number;
  name: string;
}

interface ContactFormProps {
  onSuccess?: () => void;
  contactId?: number;
  farms?: FarmOption[];
  hideFarmSelector?: boolean;
  initialData?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    whatsapp?: boolean | null;
    farms_id?: number | null;
  };
}

export function ContactForm({ onSuccess, contactId, farms = [], hideFarmSelector = false, initialData }: ContactFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [whatsapp, setWhatsapp] = useState(initialData?.whatsapp ?? false);
  const [farmsId, setFarmsId] = useState(
    initialData?.farms_id ? String(initialData.farms_id) : ""
  );
  const [saving, setSaving] = useState(false);
  const [dupCandidates, setDupCandidates] = useState<DuplicateMatch[]>([]);
  const confirmedRef = useRef(false);

  async function doSave() {
    setSaving(true);
    try {
      await fetch(contactId ? `/api/contacts/${contactId}` : "/api/contacts", {
        method: contactId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone: phone || null,
          email: email || null,
          whatsapp,
          farms_id: farmsId ? parseInt(farmsId) : null,
        }),
      });
      onSuccess?.();
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contactId && !confirmedRef.current) {
      const dupes = await checkDuplicates("contacts", name);
      if (dupes.length > 0) {
        setDupCandidates(dupes);
        return;
      }
    }
    await doSave();
  }

  return (
    <>
    <DuplicateWarningDialog
      open={dupCandidates.length > 0}
      entityLabel="Contact"
      duplicates={dupCandidates}
      onConfirm={() => { confirmedRef.current = true; setDupCandidates([]); doSave(); }}
      onCancel={() => setDupCandidates([])}
    />
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="space-y-1.5">
        <Label>Phone</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      <div className="flex items-center gap-3">
        <Checkbox
          id="whatsapp"
          checked={whatsapp}
          onCheckedChange={(v) => setWhatsapp(v === true)}
        />
        <Label htmlFor="whatsapp" className="cursor-pointer font-normal">
          Reachable via WhatsApp
        </Label>
      </div>

      {!hideFarmSelector && (
        <div className="space-y-1.5">
          <Label>Linked Farm</Label>
          <Select value={farmsId} onValueChange={(v) => setFarmsId(v ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder="No farm linked" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No farm linked</SelectItem>
              {farms.map((f) => (
                <SelectItem key={f.id} value={String(f.id)}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Button type="submit" disabled={saving} className="w-full">
        {saving ? "Saving..." : contactId ? "Update" : "Create"}
      </Button>
    </form>
    </>
  );
}
