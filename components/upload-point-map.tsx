"use client"

import { useState } from "react"
import { MapContainer, CircleMarker, Popup } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { BasemapTileLayer } from "@/components/basemap-tile-layer"
import { SatelliteToggleButton } from "@/components/satellite-toggle-button"

export default function UploadPointMap({
  lat,
  lng,
  label,
}: {
  lat: number
  lng: number
  label?: string
}) {
  const [isSatellite, setIsSatellite] = useState(false)
  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-[1000]">
        <SatelliteToggleButton satellite={isSatellite} onToggle={() => setIsSatellite((v) => !v)} />
      </div>
      <MapContainer
        center={[lat, lng]}
        zoom={15}
        style={{ height: 260, width: "100%" }}
        className="rounded-md border"
      >
        <BasemapTileLayer satellite={isSatellite} />
        <CircleMarker
          center={[lat, lng]}
          radius={10}
          pathOptions={{ color: "#10b981", fillColor: "#10b981", fillOpacity: 0.85 }}
        >
          {label && <Popup>{label}</Popup>}
        </CircleMarker>
      </MapContainer>
    </div>
  )
}
