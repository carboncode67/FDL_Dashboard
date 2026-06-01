"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface FarmFormProps {
  onSuccess?: () => void;
  initialData?: { Farm_Name?: string | null; Farmer_Name?: string | null; County?: string | null; State?: string | null; Contact_Phone?: string | null; Contact_Email?: string | null };
  farmId?: number;
}

export function FarmForm({ onSuccess, initialData, farmId }: FarmFormProps) {
  const [farmName, setFarmName] = useState(initialData?.Farm_Name ?? "");
  const [farmerName, setFarmerName] = useState(initialData?.Farmer_Name ?? "");
  const [county, setCounty] = useState(initialData?.County ?? "");
  const [state, setState] = useState(initialData?.State ?? "");
  const [phone, setPhone] = useState(initialData?.Contact_Phone ?? "");
  const [email, setEmail] = useState(initialData?.Contact_Email ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const url = farmId ? `/api/farms/${farmId}` : "/api/farms";
      const method = farmId ? "PUT" : "POST";
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Farm_Name: farmName, Farmer_Name: farmerName, County: county, State: state, Contact_Phone: phone, Contact_Email: email }),
      });
      onSuccess?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5"><Label>Farm Name</Label><Input value={farmName} onChange={(e) => setFarmName(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>Farmer Name</Label><Input value={farmerName} onChange={(e) => setFarmerName(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>County</Label><Input value={county} onChange={(e) => setCounty(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>State</Label><Input value={state} onChange={(e) => setState(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Contact Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Contact Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving..." : farmId ? "Update" : "Create"}</Button>
    </form>
  );
}
