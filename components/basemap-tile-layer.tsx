"use client"

import { TileLayer } from "react-leaflet"

// Esri World_Imagery aerial tiles. Note the {z}/{y}/{x} order — not the usual {z}/{x}/{y}.
export const ESRI_SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
export const ESRI_SATELLITE_ATTRIBUTION =
  "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"

export const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

/** Swaps between the OSM street basemap and Esri satellite imagery. `key` on each
 *  TileLayer forces react-leaflet to fully remount the layer on toggle rather than
 *  trying to diff two different tile URL templates in place. */
export function BasemapTileLayer({ satellite }: { satellite: boolean }) {
  return satellite ? (
    <TileLayer key="satellite" url={ESRI_SATELLITE_URL} attribution={ESRI_SATELLITE_ATTRIBUTION} />
  ) : (
    <TileLayer key="osm" url={OSM_URL} attribution={OSM_ATTRIBUTION} />
  )
}
