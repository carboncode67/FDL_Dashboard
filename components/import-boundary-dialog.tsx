"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export interface ImportableBoundary {
  id: number
  name: string
  kind: "field" | "zone"
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fields: ImportableBoundary[]
  zones: ImportableBoundary[]
  onImport: (boundary: ImportableBoundary) => Promise<void> | void
}

/** Lets a user copy an existing Field or ExperimentZone boundary in as a
 *  SamplingMapPolygon instead of redrawing it — see the "source" field on
 *  Sampling_Map_Polygons and POST /api/sampling-maps/[id]/polygons. */
export function ImportBoundaryDialog({ open, onOpenChange, fields, zones, onImport }: Props) {
  const [importingKey, setImportingKey] = useState<string | null>(null)

  async function handleImport(boundary: ImportableBoundary) {
    const key = `${boundary.kind}-${boundary.id}`
    setImportingKey(key)
    try {
      await onImport(boundary)
      onOpenChange(false)
    } finally {
      setImportingKey(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import a Boundary</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Fields</p>
            {fields.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No fields with a drawn boundary</p>
            ) : (
              <div className="space-y-1">
                {fields.map((f) => (
                  <BoundaryRow
                    key={`field-${f.id}`}
                    boundary={f}
                    importing={importingKey === `field-${f.id}`}
                    onImport={handleImport}
                  />
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Experiment Zones</p>
            {zones.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No zones with a boundary</p>
            ) : (
              <div className="space-y-1">
                {zones.map((z) => (
                  <BoundaryRow
                    key={`zone-${z.id}`}
                    boundary={z}
                    importing={importingKey === `zone-${z.id}`}
                    onImport={handleImport}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function BoundaryRow({
  boundary,
  importing,
  onImport,
}: {
  boundary: ImportableBoundary
  importing: boolean
  onImport: (b: ImportableBoundary) => void
}) {
  return (
    <div className="flex items-center justify-between rounded border border-slate-200 px-2.5 py-1.5">
      <span className="text-sm">{boundary.name}</span>
      <Button size="sm" variant="outline" disabled={importing} onClick={() => onImport(boundary)}>
        {importing ? "Importing…" : "Import"}
      </Button>
    </div>
  )
}
