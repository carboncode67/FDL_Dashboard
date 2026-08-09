"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const POSITION_OPTIONS = [
  "PI",
  "Graduate Student",
  "Postdoc",
  "Undergrad",
  "Staff",
  "Intern",
  "Agronomist",
  "Other",
];

const STATUS_OPTIONS = [
  "Active",
  "Inactive (available for contact)",
  "Inactive (Unavailable)",
];

interface LabMemberFormProps {
  onSuccess?: () => void;
  memberId?: string;
  initialData?: {
    name?: string | null;
    position?: string | null;
    contact_phone?: string | null;
    email?: string;
    status?: string | null;
    faa_part_107?: boolean | null;
  };
}

export function LabMemberForm({ onSuccess, initialData, memberId }: LabMemberFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [password, setPassword] = useState("");
  const [position, setPosition] = useState(initialData?.position ?? "");
  const [phone, setPhone] = useState(initialData?.contact_phone ?? "");
  const [status, setStatus] = useState(initialData?.status ?? "");
  const [faa, setFaa] = useState(initialData?.faa_part_107 ?? false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name || null,
        position: position || null,
        phone: phone || null,
        status: status || null,
        faa_part_107: faa,
      };
      if (!memberId) {
        body.email = email;
        if (password) body.password = password;
      }
      await fetch(memberId ? `/api/lab-members/${memberId}` : "/api/lab-members", {
        method: memberId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>Email {!memberId && <span className="text-red-500">*</span>}</Label>
        {memberId ? (
          <Input value={email} readOnly className="bg-slate-50 text-slate-500" />
        ) : (
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        )}
      </div>

      {!memberId && (
        <div className="space-y-1.5">
          <Label>Password <span className="text-slate-400 font-normal">(leave blank to disable web login)</span></Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Optional"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Position</Label>
        <Select value={position} onValueChange={(v) => setPosition(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="Select position..." />
          </SelectTrigger>
          <SelectContent>
            {POSITION_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="Select status..." />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Phone</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>

      <div className="flex items-center gap-3">
        <Checkbox
          id="faa-part-107"
          checked={faa}
          onCheckedChange={(v) => setFaa(v === true)}
        />
        <Label htmlFor="faa-part-107" className="cursor-pointer font-normal">
          FAA Part 107 certified
        </Label>
      </div>

      <Button type="submit" disabled={saving} className="w-full">
        {saving ? "Saving..." : memberId ? "Update" : "Create Member"}
      </Button>
    </form>
  );
}
