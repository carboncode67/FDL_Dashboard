"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface FieldGeometry {
  id: number;
  geometry: string | null;
}

function extractLatLngs(geojsonStr: string): [number, number][] {
  try {
    const result: [number, number][] = [];
    function walk(obj: unknown) {
      if (!obj || typeof obj !== "object") return;
      const o = obj as Record<string, unknown>;
      switch (o.type) {
        case "Point": {
          const c = o.coordinates as number[];
          result.push([c[1], c[0]]);
          break;
        }
        case "LineString":
        case "MultiPoint":
          (o.coordinates as number[][]).forEach((c) => result.push([c[1], c[0]]));
          break;
        case "Polygon":
        case "MultiLineString":
          (o.coordinates as number[][][]).forEach((ring) => ring.forEach((c) => result.push([c[1], c[0]])));
          break;
        case "MultiPolygon":
          (o.coordinates as number[][][][]).forEach((poly) =>
            poly.forEach((ring) => ring.forEach((c) => result.push([c[1], c[0]])))
          );
          break;
        case "Feature":
          walk(o.geometry);
          break;
        case "FeatureCollection":
          (o.features as unknown[]).forEach((f) => walk(f));
          break;
      }
    }
    walk(JSON.parse(geojsonStr));
    return result;
  } catch {
    return [];
  }
}

function AutoBounds({ fields }: { fields: FieldGeometry[] }) {
  const map = useMap();
  useEffect(() => {
    const allPoints = fields
      .filter((f) => f.geometry)
      .flatMap((f) => extractLatLngs(f.geometry!));
    if (allPoints.length > 0) {
      map.fitBounds(allPoints as [number, number][], { padding: [8, 8] });
    }
  }, [map, fields]);
  return null;
}

interface Props {
  fields: FieldGeometry[];
}

export function ExperimentFieldsMap({ fields }: Props) {
  const withGeometry = fields.filter((f) => f.geometry);

  return (
    <MapContainer
      center={[0, 0]}
      zoom={2}
      style={{ height: "200px", width: "100%", borderRadius: "6px" }}
      scrollWheelZoom={false}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {withGeometry.map((f) => {
        try {
          const geoJson = JSON.parse(f.geometry!);
          return (
            <GeoJSON
              key={f.id}
              data={geoJson}
              style={{ color: "#2563eb", weight: 2, fillOpacity: 0.15 }}
            />
          );
        } catch {
          return null;
        }
      })}
      <AutoBounds fields={fields} />
    </MapContainer>
  );
}
