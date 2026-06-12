"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
  initialData?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    whatsapp?: boolean | null;
    channel?: string | null;
    farms_id?: number | null;
    is_lab_member?: boolean | null;
  };
}

export function ContactForm({ onSuccess, contactId, farms = [], initialData }: ContactFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [channel, setChannel] = useState(initialData?.channel ?? "");
  const [isLabMember, setIsLabMember] = useState(initialData?.is_lab_member ?? false);
  const [farmsId, setFarmsId] = useState(
    initialData?.farms_id ? String(initialData.farms_id) : ""
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(contactId ? `/api/contacts/${contactId}` : "/api/contacts", {
        method: contactId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone: phone || null,
          email: email || null,
          channel: channel || null,
          whatsapp: channel === "whatsapp",
          is_lab_member: isLabMember,
          farms_id: isLabMember ? null : (farmsId ? parseInt(farmsId) : null),
        }),
      });
      onSuccess?.();
    } finally {
      setSaving(false);
    }
  }

  return (
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

      <div className="space-y-1.5">
        <Label>Messaging Channel</Label>
        <Select value={channel} onValueChange={(v) => setChannel(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="— None —" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">— None —</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <Checkbox
          id="is_lab_member"
          checked={isLabMember}
          onCheckedChange={(v) => {
            setIsLabMember(v === true);
            if (v === true) setFarmsId("");
          }}
        />
        <Label htmlFor="is_lab_member" className="cursor-pointer font-normal">
          Lab member (uploads auto-assigned by GPS proximity)
        </Label>
      </div>

      {!isLabMember && (
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
  );
}
