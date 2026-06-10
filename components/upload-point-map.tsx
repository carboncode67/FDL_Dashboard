"use client"

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet"
import "leaflet/dist/leaflet.css"

export default function UploadPointMap({
  lat,
  lng,
  label,
}: {
  lat: number
  lng: number
  label?: string
}) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={15}
      style={{ height: 260, width: "100%" }}
      className="rounded-md border"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CircleMarker
        center={[lat, lng]}
        radius={10}
        pathOptions={{ color: "#10b981", fillColor: "#10b981", fillOpacity: 0.85 }}
      >
        {label && <Popup>{label}</Popup>}
      </CircleMarker>
    </MapContainer>
  )
}
