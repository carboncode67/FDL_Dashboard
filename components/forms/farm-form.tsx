"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DuplicateWarningDialog, checkDuplicates, type DuplicateMatch } from "@/components/duplicate-warning-dialog";

interface FarmFormProps {
  onSuccess?: () => void;
  initialData?: {
    Farm_Name?: string | null;
    farm_summary?: string | null;
    is_active?: boolean;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
  farmId?: number;
}

type GeoStatus = "idle" | "geocoding" | "ok" | "notfound";

export function FarmForm({ onSuccess, initialData, farmId }: FarmFormProps) {
  const [farmName, setFarmName] = useState(initialData?.Farm_Name ?? "");
  const [summary, setSummary] = useState(initialData?.farm_summary ?? "");
  const [isActive, setIsActive] = useState(initialData?.is_active ?? true);
  const [address, setAddress] = useState(initialData?.address ?? "");
  const [latitude, setLatitude] = useState<number | null>(initialData?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(initialData?.longitude ?? null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [saving, setSaving] = useState(false);
  const [dupCandidates, setDupCandidates] = useState<DuplicateMatch[]>([]);
  const confirmedRef = useRef(false);

  async function geocode(addr: string) {
    if (!addr.trim()) return;
    setGeoStatus("geocoding");
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1`,
        { headers: { "Accept-Language": "en" } }
      );
      const data = await res.json();
      if (data.length > 0) {
        setLatitude(parseFloat(data[0].lat));
        setLongitude(parseFloat(data[0].lon));
        setGeoStatus("ok");
      } else {
        setLatitude(null);
        setLongitude(null);
        setGeoStatus("notfound");
      }
    } catch {
      setGeoStatus("notfound");
    }
  }

  async function doSave() {
    setSaving(true);
    try {
      const url = farmId ? `/api/farms/${farmId}` : "/api/farms";
      const method = farmId ? "PUT" : "POST";
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Farm_Name: farmName,
          farm_summary: summary || null,
          is_active: isActive,
          address: address || null,
          latitude,
          longitude,
        }),
      });
      onSuccess?.();
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!farmId && !confirmedRef.current) {
      const dupes = await checkDuplicates("farms", farmName);
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
      entityLabel="Farm"
      duplicates={dupCandidates}
      onConfirm={() => { confirmedRef.current = true; setDupCandidates([]); doSave(); }}
      onCancel={() => setDupCandidates([])}
    />
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5"><Label>Farm Name</Label><Input value={farmName} onChange={(e) => setFarmName(e.target.value)} required /></div>
      <div className="space-y-1.5">
        <Label>Address</Label>
        <div className="space-y-1">
          <Input
            value={address}
            onChange={(e) => { setAddress(e.target.value); setGeoStatus("idle"); }}
            onBlur={() => geocode(address)}
            placeholder="123 County Rd, Town, State"
          />
          {geoStatus === "geocoding" && <p className="text-xs text-slate-500">Geocoding…</p>}
          {geoStatus === "ok" && latitude != null && longitude != null && (
            <p className="text-xs text-green-600">Geocoded ✓ ({latitude.toFixed(5)}, {longitude.toFixed(5)})</p>
          )}
          {geoStatus === "notfound" && <p className="text-xs text-amber-600">Address not found — map will use default center</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Farmer Summary (Markdown)</Label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={8}
          placeholder="Paste or type markdown content here…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          onClick={() => setIsActive((v) => !v)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            isActive ? "bg-green-500" : "bg-slate-200"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
              isActive ? "translate-x-4.5" : "translate-x-0.5"
            }`}
          />
        </button>
        <Label>{isActive ? "Active" : "Inactive"}</Label>
      </div>
      <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving..." : farmId ? "Update" : "Create"}</Button>
    </form>
    </>
  );
}
