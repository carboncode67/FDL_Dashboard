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
];

const STATUS_OPTIONS = [
  "Active",
  "Inactive (available for contact)",
  "Inactive (Unavailable)",
];

interface LabMemberFormProps {
  onSuccess?: () => void;
  memberId?: number;
  initialData?: {
    Name?: string | null;
    Position?: string | null;
    Contact_Phone?: string | null;
    Contact_Email?: string | null;
    Status?: string | null;
    FAA_Part_107?: boolean | null;
  };
}

export function LabMemberForm({ onSuccess, initialData, memberId }: LabMemberFormProps) {
  const [name, setName] = useState(initialData?.Name ?? "");
  const [position, setPosition] = useState(initialData?.Position ?? "");
  const [phone, setPhone] = useState(initialData?.Contact_Phone ?? "");
  const [email, setEmail] = useState(initialData?.Contact_Email ?? "");
  const [status, setStatus] = useState(initialData?.Status ?? "");
  const [faa, setFaa] = useState(initialData?.FAA_Part_107 ?? false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(memberId ? `/api/lab-members/${memberId}` : "/api/lab-members", {
        method: memberId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Name: name,
          Position: position || null,
          Contact_Phone: phone || null,
          Contact_Email: email || null,
          Status: status || null,
          FAA_Part_107: faa,
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

      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
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
        {saving ? "Saving..." : memberId ? "Update" : "Create"}
      </Button>
    </form>
  );
}
