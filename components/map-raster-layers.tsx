"use client"

import { useEffect, useState } from "react"
import { GeoJSON, useMap } from "react-leaflet"
import L from "leaflet"

// georaster-layer-for-leaflet is a plain Leaflet plugin, not a react-leaflet
// component — RasterLayer below wires it in imperatively via useMap(), same pattern
// as a BoundsAdjuster. Dynamically imported inside the effect (not at module scope):
// both packages assume a browser environment (they touch `window`), and the whole
// map component using this must already be ssr:false, but a static top-level
// import would still make Next's build step try to evaluate them at bundle time.
export interface MapRaster {
  id: number
  url: string
  label: string
  kind: "raster" | "vector"
  // Set by PipelineProcessor's geo_sanity.py (verified against the run's farm
  // centroid, reprojected to EPSG:4326 on a match — see its CLAUDE.md). "unclear"
  // means the file was left un-normalized and is NOT safe to plot; null covers rows
  // from before this check existed, treated the same as a confident "ok" so older
  // data keeps rendering as it always did.
  crsStatus: "ok" | "unclear" | null
}

// Fetches and parses a GeoTIFF (whole-file, not tiled COG streaming — fine for
// lab-scale pipeline outputs; a large raster would want geotiff.js's own tile
// reader instead) and renders it as a Leaflet layer, geo-referenced from the
// file's own embedded bounds — no separate footprint/extent needs storing in the DB.
export function RasterLayer({ url }: { url: string }) {
  const map = useMap()
  useEffect(() => {
    let cancelled = false
    let layer: L.Layer | null = null

    Promise.all([import("georaster"), import("georaster-layer-for-leaflet")])
      .then(([georasterMod, geoRasterLayerMod]) =>
        fetch(url)
          .then((r) => r.arrayBuffer())
          .then((buf) => georasterMod.default(buf))
          .then((georaster) => {
            if (cancelled) return
            const GeoRasterLayer = geoRasterLayerMod.default
            layer = new GeoRasterLayer({ georaster, opacity: 0.75, resolution: 256 })
            layer.addTo(map)
          })
      )
      .catch(() => {})

    return () => {
      cancelled = true
      if (layer) map.removeLayer(layer)
    }
  }, [map, url])
  return null
}

// Fetches and renders a vector pipeline output as a plain GeoJSON layer — already
// normalized to EPSG:4326 by PipelineProcessor's geo_sanity.py before it ever
// reached the Dashboard, same convention as Fields/ExperimentZones geometry, so no
// CRS handling is needed here. Only .geojson actually renders this way: a .gpkg
// vector output is a binary SQLite file the browser can't parse client-side, so it
// silently renders nothing (still downloadable via the checklist link below).
export function VectorLayer({ url }: { url: string }) {
  const [data, setData] = useState<GeoJSON.GeoJsonObject | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setData(json)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [url])
  if (!data) return null
  return <GeoJSON data={data} style={() => ({ color: "#0891b2", weight: 2, fillColor: "#06b6d4", fillOpacity: 0.25 })} />
}
