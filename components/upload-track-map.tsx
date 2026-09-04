"use client"

import { useEffect, useState } from "react"
import { MapContainer, Polyline, CircleMarker, Popup, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { BasemapTileLayer } from "@/components/basemap-tile-layer"
import { SatelliteToggleButton } from "@/components/satellite-toggle-button"

function FitTrack({ coordinates }: { coordinates: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (coordinates.length >= 2) {
      map.fitBounds(coordinates, { padding: [20, 20] })
    }
  }, [map, coordinates])
  return null
}

export default function UploadTrackMap({
  coordinates,
  label,
}: {
  coordinates: [number, number][]
  label?: string
}) {
  const [isSatellite, setIsSatellite] = useState(false)
  const start = coordinates[0]
  const end = coordinates[coordinates.length - 1]

  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-[1000]">
        <SatelliteToggleButton satellite={isSatellite} onToggle={() => setIsSatellite((v) => !v)} />
      </div>
      <MapContainer
        center={start}
        zoom={14}
        style={{ height: 260, width: "100%" }}
        className="rounded-md border"
      >
        <BasemapTileLayer satellite={isSatellite} />
        <FitTrack coordinates={coordinates} />
        <Polyline positions={coordinates} pathOptions={{ color: "#3b82f6", weight: 3 }} />
        <CircleMarker
          center={start}
          radius={7}
          pathOptions={{ color: "#10b981", fillColor: "#10b981", fillOpacity: 1 }}
        >
          {label && <Popup>{label}</Popup>}
        </CircleMarker>
        <CircleMarker
          center={end}
          radius={7}
          pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1 }}
        />
      </MapContainer>
    </div>
  )
}
