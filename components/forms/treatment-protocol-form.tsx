"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface TreatmentProtocolFormProps {
  onSuccess?: () => void;
  protocolId?: number;
  initialData?: {
    Protocol_Name?: string | null;
    Product?: string | null;
    Rate?: number | null;
    Rate_Unit?: string | null;
    Timing?: string | null;
    Notes?: string | null;
  };
}

export function TreatmentProtocolForm({ onSuccess, protocolId, initialData }: TreatmentProtocolFormProps) {
  const [name, setName] = useState(initialData?.Protocol_Name ?? "");
  const [product, setProduct] = useState(initialData?.Product ?? "");
  const [rate, setRate] = useState(initialData?.Rate?.toString() ?? "");
  const [rateUnit, setRateUnit] = useState(initialData?.Rate_Unit ?? "");
  const [timing, setTiming] = useState(initialData?.Timing ?? "");
  const [notes, setNotes] = useState(initialData?.Notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(protocolId ? `/api/treatment-protocols/${protocolId}` : "/api/treatment-protocols", {
        method: protocolId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Protocol_Name: name, Product: product, Rate: rate ? parseFloat(rate) : null, Rate_Unit: rateUnit, Timing: timing, Notes: notes }),
      });
      onSuccess?.();
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5"><Label>Protocol Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>Product</Label><Input value={product} onChange={(e) => setProduct(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Rate</Label><Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Rate Unit</Label><Input value={rateUnit} onChange={(e) => setRateUnit(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Timing</Label><Input value={timing} onChange={(e) => setTiming(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving..." : protocolId ? "Update" : "Create"}</Button>
    </form>
  );
}
