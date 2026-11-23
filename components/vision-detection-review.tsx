"use client";

// Detection review for one vision run (phase 3 of docs/machine-vision-plan.md).
// Steps through the run's ortho detections on full-resolution chips
// (components/vision-chips.ts); each verdict becomes a training label at the
// detection's centre (lib/vision.ts reviewPrediction), so the next run learns
// from it. Loaded with next/dynamic (ssr: false) from vision-panel.tsx.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addChipPane, chipSize, ChipLoader, MAX_ZOOM, showChip, zoomFor } from "@/components/vision-chips";

type Cls = { id: number; name: string; color: string; is_background: boolean };
type Tiles = { url: string; min_zoom: number | null; max_zoom: number | null; footprint: GeoJSON.Polygon | null };
type Source = { id: number; name: string; tiles: Tiles };
type Item = {
  id: number; source_id: number; class_id: number; score: number; patches: number | null;
  centroid: [number, number]; bbox: [number, number, number, number]; review: string;
};
type ReviewState = "unreviewed" | "all" | "correct" | "incorrect";

const VIEW_PX = 440;
const PAGE = 50;
const selectCls = "h-8 rounded-md border border-stone-200 bg-white px-2 text-sm";

const boxLatLngs = (b: Item["bbox"]): L.LatLngBoundsExpression => [[b[1], b[0]], [b[3], b[2]]];

/** Ground width of a detection's frame, metres. */
function frameMeters(it: Item): number {
  const [w, s, e, n] = it.bbox;
  const lat = (s + n) / 2;
  return Math.max((e - w) * 111_320 * Math.cos((lat * Math.PI) / 180), (n - s) * 110_574);
}

const matches = (it: Item, r: ReviewState) => r === "all" || it.review === r;

export default function VisionDetectionReview({
  jobId, runId, sources: sourcesProp, classes, objectSize, canEdit, onClose,
}: {
  jobId: number; runId: number; sources: Source[]; classes: Cls[];
  objectSize: number | null; canEdit: boolean; onClose: () => void;
}) {
  // Fixed for the panel's lifetime: a parent refresh mustn't rebuild the map.
  const [sources] = useState(sourcesProp);
  const [sourceId, setSourceId] = useState(sourcesProp[0]?.id ?? 0);
  const [classFilter, setClassFilter] = useState("");
  const [reviewFilter, setReviewFilter] = useState<ReviewState>("unreviewed");
  const [order, setOrder] = useState<"confident" | "uncertain">("confident");
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pos, setPos] = useState(0);
  const inflight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chipNote, setChipNote] = useState<string | null>(null);
  const [actually, setActually] = useState("");

  const source = sources.find((s) => s.id === sourceId) ?? sources[0];
  const classOf = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const species = classes.filter((c) => !c.is_background);
  const item = items[pos] ?? null;

  const mapDiv = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const chipLayer = useRef<L.LayerGroup | null>(null);
  const boxes = useRef<L.LayerGroup | null>(null);
  const shownId = useRef<number | null>(null);
  const loaderRef = useRef<ChipLoader | null>(null);

  // One chip loader per ortho source.
  const loader = useMemo(() => new ChipLoader(jobId, source?.id ?? 0), [jobId, source?.id]);
  useEffect(() => {
    loaderRef.current = loader;
    return () => loader.dispose();
  }, [loader]);

  type Page = { total: number; items: Item[]; reviewed: Record<string, number> } | { error: string };

  /** One page of detections for the current filters (no state changes). */
  const loadPage = useCallback(async (offset: number): Promise<Page> => {
    if (!source) return { error: "No ortho" };
    const q = new URLSearchParams({ source_id: String(source.id), review: reviewFilter, order, offset: String(offset), limit: String(PAGE) });
    if (classFilter) q.set("class_id", classFilter);
    try {
      const res = await fetch(`/api/vision/runs/${runId}/review?${q}`);
      const b = await res.json();
      return res.ok ? b : { error: b.error ?? `Failed (${res.status})` };
    } catch {
      return { error: "Network error" };
    }
  }, [runId, source, reviewFilter, order, classFilter]);

  const applyPage = useCallback((p: Page, replace: boolean) => {
    if ("error" in p) { setError(p.error); return; }
    setError(null);
    setTotal(p.total);
    setCounts(p.reviewed ?? {});
    setItems((prev) => {
      if (replace) return p.items;
      const seen = new Set(prev.map((x) => x.id));
      return [...prev, ...p.items.filter((x) => !seen.has(x.id))];
    });
    if (replace) setPos(0);
  }, []);

  // (Re)load when the filters change.
  useEffect(() => {
    let live = true;
    void loadPage(0).then((p) => { if (live) applyPage(p, true); });
    return () => { live = false; };
  }, [loadPage, applyPage]);

  const fetchMore = useCallback((offset: number) => {
    if (inflight.current) return;
    inflight.current = true;
    void loadPage(offset).then((p) => applyPage(p, false)).finally(() => { inflight.current = false; });
  }, [loadPage, applyPage]);

  // Map setup per source.
  useEffect(() => {
    if (!mapDiv.current || !source) return;
    const m = L.map(mapDiv.current, { zoomControl: true, attributionControl: false, maxZoom: MAX_ZOOM, zoomSnap: 0.5 });
    addChipPane(m);
    const ring = source.tiles.footprint?.coordinates?.[0];
    L.tileLayer(source.tiles.url, {
      maxZoom: MAX_ZOOM,
      ...(source.tiles.max_zoom != null ? { maxNativeZoom: source.tiles.max_zoom } : {}),
      ...(source.tiles.min_zoom != null ? { minNativeZoom: source.tiles.min_zoom } : {}),
      ...(ring ? { bounds: L.latLngBounds(ring.map(([x, y]) => [y, x] as [number, number])) } : {}),
    }).addTo(m);
    chipLayer.current = L.layerGroup().addTo(m);
    boxes.current = L.layerGroup().addTo(m);
    if (ring) m.fitBounds(L.latLngBounds(ring.map(([x, y]) => [y, x] as [number, number])));
    else m.setView([0, 0], 2);
    map.current = m;
    shownId.current = null;
    return () => { m.remove(); map.current = null; };
  }, [source]);

  const chipMeters = useCallback((it: Item) => chipSize(objectSize, frameMeters(it) * 2.5), [objectSize]);

  // Chip + frames for the current detection; the next two chips load ahead.
  useEffect(() => {
    const m = map.current, layer = chipLayer.current, g = boxes.current;
    if (!m || !layer || !g || !item) return;
    const [lng, lat] = item.centroid;
    const size = chipMeters(item);
    if (shownId.current !== item.id) {
      m.setView([lat, lng], zoomFor(lat, size, VIEW_PX, source?.tiles.min_zoom ?? null), { animate: false });
      shownId.current = item.id;
    }
    const cancel = showChip(layer, loaderRef.current!, lat, lng, size, setChipNote);
    for (const next of items.slice(pos + 1, pos + 3)) void loaderRef.current!.get(next.centroid[1], next.centroid[0], chipMeters(next));

    g.clearLayers();
    // Neighbouring detections (from what's loaded) as thin frames.
    for (const o of items) {
      if (o.id === item.id) continue;
      const c = classOf.get(o.class_id);
      L.rectangle(boxLatLngs(o.bbox), { color: c?.color ?? "#888", weight: 1, fill: false, opacity: 0.8, interactive: false }).addTo(g);
    }
    const c = classOf.get(item.class_id);
    const color = c?.color ?? "#e11d48";
    L.rectangle(boxLatLngs(item.bbox), { color: "#fff", weight: 5, fill: false, interactive: false }).addTo(g);
    L.rectangle(boxLatLngs(item.bbox), { color, weight: 2.5, fill: false, interactive: false }).addTo(g);
    L.marker([lat, lng], {
      interactive: false,
      icon: L.divIcon({
        className: "", iconSize: [14, 14], iconAnchor: [7, 7],
        html: `<div style="width:14px;height:14px;position:relative"><div style="position:absolute;left:6px;top:0;width:2px;height:14px;background:${color};box-shadow:0 0 2px #000"></div><div style="position:absolute;top:6px;left:0;height:2px;width:14px;background:${color};box-shadow:0 0 2px #000"></div></div>`,
      }),
    }).addTo(g);
    return cancel;
  }, [item, items, pos, classOf, chipMeters, source]);

  const next = useCallback(() => {
    setActually("");
    const n = pos + 1;
    // Near the end of what's loaded: fetch more. The offset is how many loaded
    // items still match the filter (reviewed ones dropped out of "unreviewed").
    const stillMatching = items.filter((x) => matches(x, reviewFilter)).length;
    if (n >= items.length - 5 && total != null && stillMatching < total) fetchMore(stillMatching);
    setPos(Math.min(n, Math.max(items.length - 1, 0)));
  }, [pos, items, total, reviewFilter, fetchMore]);
  const prev = useCallback(() => { setActually(""); setPos((p) => Math.max(p - 1, 0)); }, []);

  const verdict = useCallback(async (v: "correct" | "wrong_class" | "not_object" | "reset", classId?: number) => {
    if (!item || !canEdit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/vision/predictions/${item.id}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict: v, ...(classId ? { class_id: classId } : {}) }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setError(b.error ?? `Failed (${res.status})`); return; }
      const was = item.review;
      setItems((list) => list.map((x) => (x.id === item.id ? { ...x, review: b.review } : x)));
      setCounts((c) => ({ ...c, [was]: Math.max((c[was] ?? 1) - 1, 0), [b.review]: (c[b.review] ?? 0) + 1 }));
      if (v !== "reset") next();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }, [item, canEdit, next]);

  // Keys: Enter/C correct, X not a plant, ←/→ step, Esc close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (!canEdit || busy || !item) return;
      else if (e.key === "Enter" || e.key === "c") void verdict("correct");
      else if (e.key === "x" || e.key === "Delete") void verdict("not_object");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, verdict, onClose, canEdit, busy, item]);

  const cls = item ? classOf.get(item.class_id) : null;
  const reviewedTotal = (counts.correct ?? 0) + (counts.incorrect ?? 0);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl space-y-3 rounded-lg bg-white p-4 text-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-medium text-stone-800">Review detections · run {runId}</h3>
            <p className="text-xs text-stone-500">
              {reviewedTotal} reviewed ({counts.correct ?? 0} correct, {counts.incorrect ?? 0} wrong) · each verdict becomes a training label for the next run
            </p>
          </div>
          <button aria-label="Close" className="text-stone-400 hover:text-stone-700" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {sources.length > 1 && (
            <label className="space-y-1">
              <span className="block text-xs text-stone-500">Ortho</span>
              <select className={selectCls} value={sourceId} onChange={(e) => setSourceId(Number(e.target.value))}>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          <label className="space-y-1">
            <span className="block text-xs text-stone-500">Show</span>
            <select className={selectCls} value={reviewFilter} onChange={(e) => setReviewFilter(e.target.value as ReviewState)}>
              <option value="unreviewed">Not yet reviewed</option>
              <option value="all">All</option>
              <option value="correct">Marked correct</option>
              <option value="incorrect">Marked wrong</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-stone-500">Species</span>
            <select className={selectCls} value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              <option value="">All species</option>
              {species.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-stone-500">Order</span>
            <select className={selectCls} value={order} onChange={(e) => setOrder(e.target.value as "confident" | "uncertain")}>
              <option value="confident">Most confident first</option>
              <option value="uncertain">Least confident first</option>
            </select>
          </label>
          {total != null && <span className="pb-1.5 text-xs text-stone-500">{total} match</span>}
        </div>

        <div className="relative">
          <div ref={mapDiv} style={{ height: VIEW_PX }} className="w-full rounded-md border border-stone-200 bg-stone-100" />
          {chipNote && (
            <p className="pointer-events-none absolute bottom-2 left-2 right-2 z-[500] rounded bg-white/90 px-2 py-1 text-xs text-stone-700 shadow">{chipNote}</p>
          )}
        </div>

        {error && <p className="text-red-600">{error}</p>}
        {total == null ? (
          <p className="text-stone-500">Loading detections…</p>
        ) : !item ? (
          <p className="text-stone-500">{reviewFilter === "unreviewed" ? "Nothing left to review with these filters." : "No detections match."}</p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={prev} disabled={pos === 0}>←</Button>
              <span className="text-stone-600">{pos + 1} / {total ?? items.length}</span>
              <Button size="sm" variant="outline" onClick={next} disabled={pos >= items.length - 1 && items.length >= (total ?? 0)}>→</Button>
              <span className="ml-2 inline-block h-3 w-3 rounded-sm" style={{ background: cls?.color }} />
              <span className="font-medium">{cls?.name ?? `class ${item.class_id}`}</span>
              <span className="text-xs text-stone-500">
                confidence {Math.round(item.score * 100)}%{item.patches ? ` · ${item.patches} patches` : ""}
                {item.review !== "unreviewed" ? ` · marked ${item.review}` : ""}
              </span>
            </div>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={busy} onClick={() => void verdict("correct")}>Correct (Enter)</Button>
                <select className={selectCls} value={actually} disabled={busy}
                  onChange={(e) => { const v = e.target.value; setActually(v); if (v) void verdict("wrong_class", Number(v)); }}>
                  <option value="">Wrong species: it&apos;s actually…</option>
                  {species.filter((c) => c.id !== item.class_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Button size="sm" variant="outline" className="text-red-700" disabled={busy} onClick={() => void verdict("not_object")}>Not a plant (X)</Button>
                {item.review !== "unreviewed" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void verdict("reset")}>Undo verdict</Button>}
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-stone-400">
          The thick frame is this detection; thin frames are others nearby. After reviewing, run again to train on your verdicts.
        </p>
      </div>
    </div>
  );
}
