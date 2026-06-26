"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SlideOverForm } from "@/components/slide-over-form";

const FLIGHT_STATUSES = [
  "Scheduled",
  "Data Collected",
  "Processing",
  "Annotating",
  "Completed",
  "Cancelled",
] as const;

const SELECT = "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const TEXTAREA = "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y min-h-[80px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export interface DroneFlightRecordData {
  id: number;
  experiment_drone_flight_id: number;
  flight_date: string | null;
  pilot: string | null;
  flight_status: string | null;
  total_acres: number | null;
  total_images: number | null;
  needs_3d: boolean;
  needs_ortho: boolean;
  processed: boolean;
  data_storage_path: string | null;
  tile_coverage_pct: number | null;
  tile_size_m: number | null;
  notes: string | null;
}

interface DroneFlightRecordFormProps {
  open: boolean;
  onClose: () => void;
  experimentDroneFlightId: number;
  record?: DroneFlightRecordData | null;
}

export function DroneFlightRecordForm({
  open,
  onClose,
  experimentDroneFlightId,
  record,
}: DroneFlightRecordFormProps) {
  const router = useRouter();
  const [flightDate, setFlightDate]         = useState(record?.flight_date?.slice(0, 10) ?? "");
  const [pilot, setPilot]                   = useState(record?.pilot ?? "");
  const [status, setStatus]                 = useState(record?.flight_status ?? "Scheduled");
  const [totalAcres, setTotalAcres]         = useState(record?.total_acres?.toString() ?? "");
  const [totalImages, setTotalImages]       = useState(record?.total_images?.toString() ?? "");
  const [needs3d, setNeeds3d]               = useState(record?.needs_3d ?? false);
  const [needsOrtho, setNeedsOrtho]         = useState(record?.needs_ortho ?? false);
  const [processed, setProcessed]           = useState(record?.processed ?? false);
  const [storagePath, setStoragePath]       = useState(record?.data_storage_path ?? "");
  const [tileCoverage, setTileCoverage]     = useState(record?.tile_coverage_pct?.toString() ?? "");
  const [tileSize, setTileSize]             = useState(record?.tile_size_m?.toString() ?? "");
  const [notes, setNotes]                   = useState(record?.notes ?? "");
  const [saving, setSaving]                 = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        experiment_drone_flight_id: experimentDroneFlightId,
        flight_date:        flightDate || null,
        pilot:              pilot || null,
        flight_status:      status,
        total_acres:        totalAcres ? parseFloat(totalAcres) : null,
        total_images:       totalImages ? parseInt(totalImages) : null,
        needs_3d:           needs3d,
        needs_ortho:        needsOrtho,
        processed:          processed,
        data_storage_path:  storagePath || null,
        tile_coverage_pct:  tileCoverage ? parseFloat(tileCoverage) : null,
        tile_size_m:        tileSize ? parseFloat(tileSize) : null,
        notes:              notes || null,
      };

      await fetch(record ? `/api/drone-flights/${record.id}` : "/api/drone-flights", {
        method: record ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      router.refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <SlideOverForm
      open={open}
      onClose={onClose}
      title={record ? "Edit Flight Record" : "Add Flight Record"}
      description="Track an individual drone flight through the full processing lifecycle."
      onSave={handleSave}
      saving={saving}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Flight Date</Label>
          <Input type="date" value={flightDate} onChange={(e) => setFlightDate(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Pilot</Label>
          <Input value={pilot} onChange={(e) => setPilot(e.target.value)} placeholder="Pilot name or initials" />
        </div>

        <div className="space-y-1.5">
          <Label>Status</Label>
          <select className={SELECT} value={status} onChange={(e) => setStatus(e.target.value)}>
            {FLIGHT_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Total Acres</Label>
            <Input type="number" step="0.01" min="0" value={totalAcres} onChange={(e) => setTotalAcres(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Total Images</Label>
            <Input type="number" min="0" value={totalImages} onChange={(e) => setTotalImages(e.target.value)} placeholder="0" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Processing Outputs</Label>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={needs3d}
              onChange={(e) => setNeeds3d(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            3D Model needed
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={needsOrtho}
              onChange={(e) => setNeedsOrtho(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Orthocorrected image needed
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={processed}
              onChange={(e) => setProcessed(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Processed (products stored)
          </label>
        </div>

        <div className="space-y-1.5">
          <Label>Data Storage Path</Label>
          <Input
            value={storagePath}
            onChange={(e) => setStoragePath(e.target.value)}
            placeholder="/mnt/tank/drones/FarmName/2026-07-01/"
          />
          <p className="text-xs text-muted-foreground">Path to imagery on the lab zraid array.</p>
        </div>

        <div className="space-y-1.5">
          <Label>AI Tile Generation</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Coverage %</p>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={tileCoverage}
                onChange={(e) => setTileCoverage(e.target.value)}
                placeholder="e.g. 20"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Tile size (m)</p>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={tileSize}
                onChange={(e) => setTileSize(e.target.value)}
                placeholder="e.g. 10"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Random tile subset for annotation/AI training.</p>
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <textarea
            className={TEXTAREA}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Flight conditions, equipment issues, etc."
          />
        </div>
      </div>
    </SlideOverForm>
  );
}
