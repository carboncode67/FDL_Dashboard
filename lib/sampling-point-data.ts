import { prisma } from "@/lib/prisma";

// Per-point data attribution for Sampling Maps: a point "has data" once any Form_Response or
// Sampling_Point_Collection is attributed to it. Used to lock the point's position (moving it
// afterwards would silently disagree with where the data was actually collected) and to flag
// it in the editor.
export async function getPointDataCounts(pointIds: number[]): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (pointIds.length === 0) return counts;
  const [responses, collections] = await Promise.all([
    prisma.formResponse.groupBy({
      by: ["sampling_point_id"],
      where: { sampling_point_id: { in: pointIds } },
      _count: { _all: true },
    }),
    prisma.samplingPointCollection.groupBy({
      by: ["sampling_point_id"],
      where: { sampling_point_id: { in: pointIds } },
      _count: { _all: true },
    }),
  ]);
  for (const r of responses) {
    if (r.sampling_point_id !== null) counts.set(r.sampling_point_id, (counts.get(r.sampling_point_id) ?? 0) + r._count._all);
  }
  for (const c of collections) {
    counts.set(c.sampling_point_id, (counts.get(c.sampling_point_id) ?? 0) + c._count._all);
  }
  return counts;
}

// Form photo answers store the mobile client's content_hash for an uploaded photo, not a filename
// — and the photo may not have uploaded yet (offline-first), so a hash can legitimately be
// missing. Where the photo lands depends on who uploaded it (POST /api/upload/photo): a contact's
// goes to Photos, a lab member's to Lab_Member_Uploads (media_type "photo"). Both store files in
// the same photos/ directory, so both resolve to a filename served by /api/files/photos/<name>.
// Checking only Photos left every lab-member photo stuck at "uploading…" forever.
export async function resolvePhotoFilenames(hashes: Iterable<string>): Promise<Map<string, string>> {
  const unique = Array.from(new Set(hashes));
  const result = new Map<string, string>();
  if (unique.length === 0) return result;
  const [photos, labUploads] = await Promise.all([
    prisma.photo.findMany({
      where: { content_hash: { in: unique } },
      select: { content_hash: true, filename: true },
    }),
    prisma.labMemberUpload.findMany({
      where: { content_hash: { in: unique }, media_type: "photo", filename: { not: null } },
      select: { content_hash: true, filename: true },
    }),
  ]);
  for (const p of [...photos, ...labUploads]) {
    if (p.content_hash && p.filename) result.set(p.content_hash, p.filename);
  }
  return result;
}
