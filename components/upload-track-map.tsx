"use client"

import { useEffect } from "react"
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"

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
  const start = coordinates[0]
  const end = coordinates[coordinates.length - 1]

  return (
    <MapContainer
      center={start}
      zoom={14}
      style={{ height: 260, width: "100%" }}
      className="rounded-md border"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
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
  )
}
