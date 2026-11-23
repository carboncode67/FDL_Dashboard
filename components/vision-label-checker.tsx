"use client";

// Label checker for one ortho source of a machine-vision job (issue #4,
// migration 104). Steps through the labels tile by tile over the ortho's own
// tiles: drag the point (or click the tile) to put it on the object, keep it,
// reject it, or change its class. Also where the job's rough object size is
// set: the solid circle is the object size, the dashed one is what a point
// label actually trains on (lib/vision-scale.ts).
//
// Loaded with next/dynamic (ssr: false) from vision-panel.tsx; plain Leaflet
// rather than react-leaflet since the view is driven imperatively.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { scaleParams } from "@/lib/vision-scale";
import { X } from "lucide-react";

type Label = { id: number; class_id: number; geom_kind: string; geom: GeoJSON.Point | GeoJSON.Polygon; origin: string; checked: boolean; rejected: boolean };
type Cls = { id: number; name: string; color: string; is_background: boolean };
type Tiles = { url: string; min_zoom: number | null; max_zoom: number | null; footprint: GeoJSON.Polygon | null };
type Filter = "unchecked" | "all" | "rejected";

const VIEW_PX = 420;
const selectCls = "h-8 rounded-md border border-stone-200 bg-white px-2 text-sm";

function centerOf(l: Label): [number, number] {
  if (l.geom.type === "Point") return [l.geom.coordinates[1], l.geom.coordinates[0]];
  const ring = l.geom.coordinates[0];
  const n = ring.length - 1 || 1;
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) { x += ring[i][0]; y += ring[i][1]; }
  return [y / n, x / n];
}

/** Zoom at which VIEW_PX pixels span `meters` at this latitude. */
function zoomFor(lat: number, meters: number, tiles: Tiles): number {
  const z = Math.log2((156543.03 * Math.cos((lat * Math.PI) / 180) * VIEW_PX) / meters);
  const hi = (tiles.max_zoom ?? 21) + 2;
  return Math.max(tiles.min_zoom ?? 12, Math.min(hi, Math.round(z * 2) / 2));
}

export default function VisionLabelChecker({
  jobId, sourceId, sourceName, tiles: tilesProp, classes, objectSize, canEdit, onClose,
}: {
  jobId: number; sourceId: number; sourceName: string; tiles: Tiles; classes: Cls[];
  objectSize: number | null; canEdit: boolean; onClose: () => void;
}) {
  // Fixed for the checker's lifetime: a parent refresh hands in a new object,
  // which mustn't rebuild the map.
  const [tiles] = useState(tilesProp);
  const [labels, setLabels] = useState<Label[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("unchecked");
  const [classFilter, setClassFilter] = useState<string>("");
  const [queue, setQueue] = useState<number[]>([]); // label ids, frozen when the filter changes
  const [pos, setPos] = useState(0);
  const [size, setSize] = useState<string>(objectSize ? String(objectSize) : "");
  const [saving, setSaving] = useState(false);

  const mapDiv = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const others = useRef<L.LayerGroup | null>(null);
  const current = useRef<L.LayerGroup | null>(null);

  const classOf = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const sizeM = Number(size) > 0 ? Number(size) : null;
  const scale = scaleParams(sizeM);
  const byId = useMemo(() => new Map((labels ?? []).map((l) => [l.id, l])), [labels]);
  const label = byId.get(queue[pos] ?? -1) ?? null;

  // (Re)build the queue when the labels arrive or the filter changes — not
  // on every edit, so a kept label doesn't vanish from under the user.
  const rebuild = useCallback((ls: Label[], f: Filter, cf: string) => {
    const q = ls.filter((l) =>
      (f === "all" || (f === "rejected" ? l.rejected : !l.checked && !l.rejected)) &&
      (!cf || String(l.class_id) === cf)).map((l) => l.id);
    setQueue(q);
    setPos(0);
  }, []);

  // Load the labels.
  useEffect(() => {
    fetch(`/api/vision/${jobId}/labels?source_id=${sourceId}`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject((await r.json().catch(() => ({}))).error ?? `Failed (${r.status})`)))
      .then((b) => { setLabels(b.labels); rebuild(b.labels, "unchecked", ""); })
      .catch((e) => setError(String(e)));
  }, [jobId, sourceId, rebuild]);

  // Map setup.
  useEffect(() => {
    if (!mapDiv.current || map.current) return;
    const m = L.map(mapDiv.current, { zoomControl: true, attributionControl: false, maxZoom: 24, zoomSnap: 0.5 });
    const ring = tiles.footprint?.coordinates?.[0];
    L.tileLayer(tiles.url, {
      maxZoom: 24,
      ...(tiles.max_zoom != null ? { maxNativeZoom: tiles.max_zoom } : {}),
      ...(tiles.min_zoom != null ? { minNativeZoom: tiles.min_zoom } : {}),
      ...(ring ? { bounds: L.latLngBounds(ring.map(([x, y]) => [y, x] as [number, number])) } : {}),
    }).addTo(m);
    others.current = L.layerGroup().addTo(m);
    current.current = L.layerGroup().addTo(m);
    if (ring) m.fitBounds(L.latLngBounds(ring.map(([x, y]) => [y, x] as [number, number])));
    else m.setView([0, 0], 2);
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, [tiles]);

  const patch = useCallback(async (id: number, body: Record<string, unknown>) => {
    setError(null);
    try {
      const res = await fetch(`/api/vision/${jobId}/labels/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setError(b.error ?? `Save failed (${res.status})`); return false; }
      setLabels((ls) => ls && ls.map((l) => (l.id === id ? (b.label as Label) : l)));
      return true;
    } catch {
      setError("Network error");
      return false;
    }
  }, [jobId]);

  const move = useCallback((id: number, ll: L.LatLng) => {
    void patch(id, { geom: { type: "Point", coordinates: [ll.lng, ll.lat] } });
  }, [patch]);

  // Neighbouring labels as small dots, so duplicates and near misses show.
  useEffect(() => {
    const g = others.current;
    if (!g || !labels) return;
    g.clearLayers();
    for (const l of labels) {
      if (l.id === label?.id) continue;
      const c = classOf.get(l.class_id);
      const [lat, lng] = centerOf(l);
      L.circleMarker([lat, lng], {
        radius: 4, weight: 1.5, color: l.rejected ? "#a8a29e" : "#fff",
        fillColor: c?.color ?? "#888", fillOpacity: l.rejected ? 0 : 0.9, interactive: false,
      }).addTo(g);
    }
  }, [labels, label?.id, classOf]);

  // The current label: draggable point + object-size circles, or its polygon.
  const shownId = useRef<number | null>(null);
  useEffect(() => {
    const m = map.current, g = current.current;
    if (!m || !g) return;
    g.clearLayers();
    if (!label) return;
    const c = classOf.get(label.class_id);
    const color = label.rejected ? "#a8a29e" : c?.color ?? "#e11d48";
    const [lat, lng] = centerOf(label);
    if (shownId.current !== label.id) {
      m.setView([lat, lng], zoomFor(lat, Math.max((sizeM ?? 1) * 6, 3), tiles), { animate: false });
      shownId.current = label.id;
    }
    if (label.geom.type === "Polygon") {
      L.polygon(label.geom.coordinates[0].map(([x, y]) => [y, x] as [number, number]), {
        color, weight: 2, fillOpacity: 0.1, dashArray: label.rejected ? "4 4" : undefined, interactive: false,
      }).addTo(g);
      return;
    }
    const outline = sizeM ? L.circle([lat, lng], { radius: sizeM / 2, color, weight: 2, fill: false, interactive: false }).addTo(g) : null;
    const core = sizeM ? L.circle([lat, lng], { radius: scale.point_radius_m, color, weight: 1, dashArray: "3 3", fill: false, interactive: false }).addTo(g) : null;
    const marker = L.marker([lat, lng], {
      draggable: canEdit && !label.rejected,
      icon: L.divIcon({
        className: "",
        iconSize: [22, 22], iconAnchor: [11, 11],
        html: `<div style="width:22px;height:22px;position:relative">
          <div style="position:absolute;left:10px;top:0;width:2px;height:22px;background:${color};box-shadow:0 0 2px #000"></div>
          <div style="position:absolute;top:10px;left:0;height:2px;width:22px;background:${color};box-shadow:0 0 2px #000"></div></div>`,
      }),
    }).addTo(g);
    marker.on("drag", (e) => {
      const ll = (e.target as L.Marker).getLatLng();
      outline?.setLatLng(ll);
      core?.setLatLng(ll);
    });
    marker.on("dragend", (e) => move(label.id, (e.target as L.Marker).getLatLng()));
  }, [label, classOf, sizeM, scale.point_radius_m, tiles, canEdit, move]);

  // Click on the tile = put the point there.
  useEffect(() => {
    const m = map.current;
    if (!m || !label || label.geom.type !== "Point" || !canEdit || label.rejected) return;
    const onClick = (e: L.LeafletMouseEvent) => move(label.id, e.latlng);
    m.on("click", onClick);
    return () => { m.off("click", onClick); };
  }, [label, canEdit, move]);

  const next = useCallback(() => setPos((p) => Math.min(p + 1, Math.max(queue.length - 1, 0))), [queue.length]);
  const prev = useCallback(() => setPos((p) => Math.max(p - 1, 0)), []);
  const keep = useCallback(async () => { if (label && (await patch(label.id, { checked: true }))) next(); }, [label, patch, next]);
  const reject = useCallback(async () => { if (label && (await patch(label.id, { rejected: true }))) next(); }, [label, patch, next]);
  const restore = useCallback(async () => { if (label) await patch(label.id, { rejected: false }); }, [label, patch]);

  // Keyboard: Enter/K keep, X/Delete reject, ←/→ step, Esc close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (!canEdit || !label) return;
      else if (e.key === "Enter" || e.key === "k") void (label.rejected ? restore() : keep());
      else if (e.key === "x" || e.key === "Delete") void reject();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, keep, reject, restore, onClose, canEdit, label]);

  async function saveSize(v: string) {
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/vision/${jobId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ object_size_m: v.trim() === "" ? null : Number(v) }),
      });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Couldn't save the object size");
    } finally {
      setSaving(false);
    }
  }

  const total = labels?.length ?? 0;
  const checked = labels?.filter((l) => l.checked && !l.rejected).length ?? 0;
  const rejected = labels?.filter((l) => l.rejected).length ?? 0;
  const c = label ? classOf.get(label.class_id) : null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl space-y-3 rounded-lg bg-white p-4 text-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-medium text-stone-800">Check labels · {sourceName}</h3>
            <p className="text-xs text-stone-500">{checked} of {total} checked · {rejected} rejected</p>
          </div>
          <button aria-label="Close" className="text-stone-400 hover:text-stone-700" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="block text-xs text-stone-500">Show</span>
            <select className={selectCls} value={filter} onChange={(e) => { const f = e.target.value as Filter; setFilter(f); if (labels) rebuild(labels, f, classFilter); }}>
              <option value="unchecked">Not yet checked</option>
              <option value="all">All labels</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-stone-500">Class</span>
            <select className={selectCls} value={classFilter} onChange={(e) => { setClassFilter(e.target.value); if (labels) rebuild(labels, filter, e.target.value); }}>
              <option value="">All classes</option>
              {classes.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-stone-500">Object size (m across){saving ? " · saving…" : ""}</span>
            <Input className="h-8 w-24" type="number" min={0.02} max={200} step={0.05} value={size} disabled={!canEdit}
              placeholder="e.g. 0.3" onChange={(e) => setSize(e.target.value)} onBlur={(e) => void saveSize(e.target.value)} />
          </label>
          <p className="max-w-xs text-xs text-stone-500">
            {sizeM
              ? <>Solid circle = object size; dashed = what one point trains on. Orthos are embedded at ≈{((scale.gsd_m ?? 0) * 100).toFixed(1)} cm/px (or native, if coarser).</>
              : <>Set the rough size of the objects so the first run picks a sensible resolution. Size it against the circle on a few labels.</>}
          </p>
        </div>

        <div ref={mapDiv} style={{ height: VIEW_PX }} className="w-full rounded-md border border-stone-200 bg-stone-100" />

        {error && <p className="text-red-600">{error}</p>}
        {labels == null ? (
          <p className="text-stone-500">Loading labels…</p>
        ) : queue.length === 0 ? (
          <p className="text-stone-500">{filter === "unchecked" ? "Every label here has been checked." : "No labels match."}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={prev} disabled={pos === 0}>← Prev</Button>
            <span className="text-stone-600">{pos + 1} / {queue.length}</span>
            <Button size="sm" variant="outline" onClick={next} disabled={pos >= queue.length - 1}>Next →</Button>
            {label && (
              <>
                <span className="mx-1 inline-block h-3 w-3 rounded-full" style={{ background: c?.color }} />
                {canEdit ? (
                  <select className={selectCls} value={label.class_id} onChange={(e) => void patch(label.id, { class_id: Number(e.target.value) })}>
                    {classes.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                  </select>
                ) : <span>{c?.name}</span>}
                <span className="text-xs text-stone-400">
                  {label.geom_kind}{label.origin === "gps_import" ? " · imported" : ""}
                  {label.rejected ? " · rejected" : label.checked ? " · checked" : ""}
                </span>
                {canEdit && (
                  <span className="ml-auto flex gap-2">
                    {label.rejected ? (
                      <Button size="sm" variant="outline" onClick={() => void restore()}>Restore</Button>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" className="text-red-700" onClick={() => void reject()}>Reject (X)</Button>
                        <Button size="sm" onClick={() => void keep()}>Keep (Enter)</Button>
                      </>
                    )}
                  </span>
                )}
              </>
            )}
          </div>
        )}
        {canEdit && (
          <p className="text-xs text-stone-400">
            Drag the cross, or click the image, to put a point on its object (that saves it as checked). ←/→ step without changing anything.
          </p>
        )}
      </div>
    </div>
  );
}
