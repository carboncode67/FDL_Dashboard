"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
  farmId: number
  fields: ImportableBoundary[]
  zones: ImportableBoundary[]
  onImport: (boundary: ImportableBoundary) => Promise<void> | void
}

/** Lets a user copy an existing Field or ExperimentZone boundary in as a
 *  SamplingMapPolygon instead of redrawing it — see the "source" field on
 *  Sampling_Map_Polygons and POST /api/sampling-maps/[id]/polygons. */
export function ImportBoundaryDialog({ open, onOpenChange, farmId, fields, zones, onImport }: Props) {
  const router = useRouter()
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
            <p className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Fields</p>
            {fields.length === 0 ? (
              <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-2">
                <p className="text-sm text-amber-800">No fields with a drawn boundary yet.</p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    render={<a href={`/farms/${farmId}/draw-field`} target="_blank" rel="noopener noreferrer" />}
                  >
                    Add a field →
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
                    I added one, refresh
                  </Button>
                </div>
              </div>
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
            <p className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Experiment Zones</p>
            {zones.length === 0 ? (
              <p className="text-sm text-stone-400 italic">No zones with a boundary</p>
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
    <div className="flex items-center justify-between rounded border border-stone-200 px-2.5 py-1.5">
      <span className="text-sm">{boundary.name}</span>
      <Button size="sm" variant="outline" disabled={importing} onClick={() => onImport(boundary)}>
        {importing ? "Importing…" : "Import"}
      </Button>
    </div>
  )
}
