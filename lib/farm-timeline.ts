/**
 * The farm page's timeline (docs/context-update-and-farm-timeline-plan.md §2):
 * the spatial-context lanes from lib/context-timeline.ts (weekly drought,
 * Sentinel-2 dates) plus the farm's data-collection events — photos, notes,
 * audio, video, documents, form responses, drone flights and management
 * events (synced from OFE, lib/ofe-management-sync.ts). Contact uploads and
 * lab-member uploads land in the same lane per media type.
 *
 * The date range is the union of the context range and the events. Each source
 * table contributes at most PER_SOURCE rows and the merged list at most
 * EVENT_CAP (newest kept), so a farm with years of photos can't balloon the
 * payload; `capped` tells the UI some older events were left out.
 */
import { prisma } from "@/lib/prisma";
import { buildContextTimeline, type ContextTimeline } from "@/lib/context-timeline";

export type EventKind = "photo" | "note" | "audio" | "video" | "document" | "form" | "drone" | "management";

export interface TimelineEvent {
  id: string; // "<source>:<row id>", stable for keys and selection
  kind: EventKind;
  at: string; // ISO datetime; date-only sources are pinned to 12:00Z
  label: string;
  // Management events: the operation type (Tillage, Planting…) — the timeline
  // colours each type's triangles by it.
  subtype?: string | null;
  detail?: string | null;
  lat?: number | null;
  lng?: number | null;
  href?: string | null;
}

export interface FarmTimeline extends Omit<ContextTimeline, "start" | "end"> {
  start: string; // YYYY-MM-DD
  end: string;
  events: TimelineEvent[];
  counts: Partial<Record<EventKind, number>>; // events per kind in `events`
  capped: boolean;
}

const EVENT_CAP = 5000;
const PER_SOURCE = 2000;

const snippet = (s: string | null | undefined, n = 80) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t || null;
};
const noonOf = (d: Date) => `${d.toISOString().slice(0, 10)}T12:00:00.000Z`;
const fileHref = (dir: string, filename: string | null | undefined) =>
  filename ? `/api/files/${dir}/${encodeURIComponent(filename)}` : null;

const LAB_KIND: Record<string, { kind: EventKind; dir: string | null; label: string }> = {
  photo: { kind: "photo", dir: "photos", label: "Photo" },
  note: { kind: "note", dir: null, label: "Note" },
  recording: { kind: "audio", dir: "recordings", label: "Recording" },
  video: { kind: "video", dir: "videos", label: "Video" },
  document: { kind: "document", dir: "documents", label: "Document" },
};

async function collectEvents(farmId: number): Promise<TimelineEvent[]> {
  const take = PER_SOURCE;
  const contact = { select: { name: true } } as const;
  const [photos, notes, recordings, videos, documents, labUploads, forms, flights, management] = await Promise.all([
    prisma.photo.findMany({
      where: { farm_id: farmId }, take, orderBy: { id: "desc" },
      select: { id: true, filename: true, note: true, latitude: true, longitude: true, timestamp: true, received_at: true, Contact: contact },
    }),
    prisma.note.findMany({
      where: { farm_id: farmId }, take, orderBy: { id: "desc" },
      select: { id: true, content: true, latitude: true, longitude: true, timestamp: true, received_at: true, Contact: contact },
    }),
    prisma.recording.findMany({
      where: { farm_id: farmId }, take, orderBy: { id: "desc" },
      select: { id: true, filename: true, start_latitude: true, start_longitude: true, start_time: true, received_at: true, Contact: contact },
    }),
    prisma.video.findMany({
      where: { farm_id: farmId }, take, orderBy: { id: "desc" },
      select: { id: true, filename: true, note: true, latitude: true, longitude: true, timestamp: true, received_at: true, Contact: contact },
    }),
    prisma.document.findMany({
      where: { farm_id: farmId }, take, orderBy: { id: "desc" },
      select: { id: true, filename: true, original_name: true, timestamp: true, uploaded_at: true, Contact: contact },
    }),
    prisma.labMemberUpload.findMany({
      where: { farm_id: farmId, media_type: { in: Object.keys(LAB_KIND) } }, take, orderBy: { id: "desc" },
      select: {
        id: true, media_type: true, filename: true, content: true, latitude: true, longitude: true,
        date_collected: true, start_time: true, received_at: true, User: { select: { name: true } },
      },
    }),
    prisma.formResponse.findMany({
      where: { farm_id: farmId }, take, orderBy: { id: "desc" },
      select: { id: true, form_id: true, submitted_at: true, lat: true, lng: true, Form: { select: { title: true } }, Contact: contact, User: { select: { name: true } } },
    }),
    prisma.droneFlightRecord.findMany({
      where: { flight_date: { not: null }, ExperimentDroneFlight: { Experiment: { farm_id: farmId } } }, take, orderBy: { id: "desc" },
      select: {
        id: true, flight_date: true, flight_status: true, pilot: true,
        ExperimentDroneFlight: { select: { Drone: { select: { Name: true } }, Experiment: { select: { id: true, experiment_name: true } } } },
      },
    }),
    prisma.managementEvent.findMany({
      where: { farm_id: farmId }, take, orderBy: { event_date: "desc" },
      select: {
        id: true, event_date: true, notes: true, product: true,
        OperationType: { select: { name: true, Category: { select: { name: true } } } },
        Fields: { select: { Field: { select: { Name: true } } } },
      },
    }),
  ]);

  const by = (name: string | null | undefined) => (name ? ` · ${name}` : "");
  const out: TimelineEvent[] = [];

  for (const p of photos) out.push({
    id: `photo:${p.id}`, kind: "photo", at: (p.timestamp ?? p.received_at).toISOString(),
    label: `Photo${by(p.Contact?.name)}`, detail: snippet(p.note), lat: p.latitude, lng: p.longitude, href: fileHref("photos", p.filename),
  });
  for (const n of notes) out.push({
    id: `note:${n.id}`, kind: "note", at: (n.timestamp ?? n.received_at).toISOString(),
    label: `Note${by(n.Contact?.name)}`, detail: snippet(n.content), lat: n.latitude, lng: n.longitude,
  });
  for (const r of recordings) out.push({
    id: `recording:${r.id}`, kind: "audio", at: (r.start_time ?? r.received_at).toISOString(),
    label: `Recording${by(r.Contact?.name)}`, lat: r.start_latitude, lng: r.start_longitude, href: fileHref("recordings", r.filename),
  });
  for (const v of videos) out.push({
    id: `video:${v.id}`, kind: "video", at: (v.timestamp ?? v.received_at).toISOString(),
    label: `Video${by(v.Contact?.name)}`, detail: snippet(v.note), lat: v.latitude, lng: v.longitude, href: fileHref("videos", v.filename),
  });
  for (const d of documents) out.push({
    id: `document:${d.id}`, kind: "document", at: (d.timestamp ?? d.uploaded_at).toISOString(),
    label: `Document${by(d.Contact?.name)}`, detail: snippet(d.original_name ?? d.filename), href: fileHref("documents", d.filename),
  });
  for (const u of labUploads) {
    const m = LAB_KIND[u.media_type ?? ""];
    if (!m) continue;
    out.push({
      id: `lab:${u.id}`, kind: m.kind, at: (u.date_collected ?? u.start_time ?? u.received_at).toISOString(),
      label: `${m.label}${by(u.User?.name ?? "Lab member")}`, detail: snippet(u.content),
      lat: u.latitude, lng: u.longitude, href: m.dir ? fileHref(m.dir, u.filename) : null,
    });
  }
  for (const f of forms) out.push({
    id: `form:${f.id}`, kind: "form", at: f.submitted_at.toISOString(),
    label: `${f.Form.title}${by(f.Contact?.name ?? f.User?.name)}`, lat: f.lat, lng: f.lng, href: `/forms/${f.form_id}/responses`,
  });
  for (const fl of flights) {
    const exp = fl.ExperimentDroneFlight.Experiment;
    out.push({
      id: `drone:${fl.id}`, kind: "drone", at: noonOf(fl.flight_date!),
      label: `Drone flight · ${fl.ExperimentDroneFlight.Drone.Name ?? "drone"}`,
      detail: [exp.experiment_name, fl.flight_status, fl.pilot && `pilot ${fl.pilot}`].filter(Boolean).join(" · ") || null,
      href: `/farms/${farmId}/experiments/${exp.id}`,
    });
  }
  for (const m of management) {
    const product = m.product && typeof m.product === "object" ? (m.product as { brand_name?: string }).brand_name : null;
    const fields = m.Fields.map((f) => f.Field.Name).filter(Boolean).join(", ");
    out.push({
      id: `management:${m.id}`, kind: "management", at: noonOf(m.event_date),
      subtype: m.OperationType.name,
      label: `${m.OperationType.name} (${m.OperationType.Category.name})`,
      detail: [fields, product, snippet(m.notes, 60)].filter(Boolean).join(" · ") || null,
    });
  }
  return out;
}

export async function buildFarmTimeline(farmId: number): Promise<FarmTimeline | null> {
  const [context, all] = await Promise.all([buildContextTimeline(farmId), collectEvents(farmId)]);

  all.sort((a, b) => b.at.localeCompare(a.at));
  const capped = all.length > EVENT_CAP || all.length >= PER_SOURCE;
  const events = all.slice(0, EVENT_CAP).reverse();
  const counts: Partial<Record<EventKind, number>> = {};
  for (const e of events) counts[e.kind] = (counts[e.kind] ?? 0) + 1;

  if (!context && events.length === 0) return null;

  let start = context?.start ?? events[0].at.slice(0, 10);
  let end = context?.end ?? events[events.length - 1].at.slice(0, 10);
  if (events.length) {
    if (events[0].at.slice(0, 10) < start) start = events[0].at.slice(0, 10);
    if (events[events.length - 1].at.slice(0, 10) > end) end = events[events.length - 1].at.slice(0, 10);
  }
  return {
    start,
    end,
    drought: context?.drought ?? [],
    imagery: context?.imagery ?? [],
    events,
    counts,
    capped,
  };
}
