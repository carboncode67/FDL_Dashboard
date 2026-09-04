"use client"

interface SatelliteToggleButtonProps {
  satellite: boolean
  onToggle: () => void
  className?: string
}

/** Shared "Satellite View" / "Map View" button for maps that offer the Esri aerial
 *  imagery basemap alongside OpenStreetMap — see `basemap-tile-layer.tsx`. */
export function SatelliteToggleButton({ satellite, onToggle, className = "" }: SatelliteToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`text-xs font-medium bg-white border border-slate-300 rounded px-2.5 py-1 shadow-sm hover:bg-slate-50 transition-colors ${className}`}
    >
      {satellite ? "Map View" : "Satellite View"}
    </button>
  )
}
