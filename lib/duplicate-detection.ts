import sharp from "sharp";
import type { Prisma } from "@prisma/client";
import { haversineMetres } from "@/lib/utils";

// Tunable thresholds. Recording position tolerance matches the 100m radius
// already used by the merge-suggestion heuristic in the data-sorting detail
// page, for consistency.
export const PHASH_HAMMING_THRESHOLD = 10; // of 64 bits
export const RECORDING_DURATION_TOLERANCE_SEC = 15;
export const RECORDING_TIME_WINDOW_MIN = 15;
export const RECORDING_POSITION_TOLERANCE_M = 100;

const POPCOUNT_NIBBLE = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/**
 * Perceptual hash (dHash): resize to 9x8 grayscale, compare each pixel to
 * its right neighbor. Robust to minor recompression/resizing, unlike an
 * exact content_hash.
 */
export async function computeImageHash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer)
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = data[row * 9 + col];
      const right = data[row * 9 + col + 1];
      bits += left < right ? "1" : "0";
    }
  }

  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    dist += POPCOUNT_NIBBLE[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  }
  return dist;
}

/** Returns the id of the closest candidate under the pHash threshold, or null. */
export function findClosestPhotoMatch(
  candidates: { id: number; phash: string | null }[],
  phash: string
): number | null {
  let best: { id: number; dist: number } | null = null;
  for (const c of candidates) {
    if (!c.phash) continue;
    const dist = hammingDistance(c.phash, phash);
    if (dist <= PHASH_HAMMING_THRESHOLD && (!best || dist < best.dist)) {
      best = { id: c.id, dist };
    }
  }
  return best?.id ?? null;
}

/**
 * Returns the id of the closest candidate matching on duration + position
 * (both within tolerance), or null. Candidates should already be scoped to
 * the same submitter and a time window around target.startTime by the
 * caller's query -- this only applies the duration/position filter.
 */
export function findClosestRecordingMatch(
  candidates: { id: number; startTime: Date | null; endTime: Date | null; lat: number | null; lng: number | null }[],
  target: { startTime: Date | null; endTime: Date | null; lat: number | null; lng: number | null }
): number | null {
  if (!target.startTime || !target.endTime || target.lat == null || target.lng == null) return null;
  const targetDuration = (target.endTime.getTime() - target.startTime.getTime()) / 1000;

  let best: { id: number; dist: number } | null = null;
  for (const c of candidates) {
    if (!c.startTime || !c.endTime || c.lat == null || c.lng == null) continue;
    const candDuration = (c.endTime.getTime() - c.startTime.getTime()) / 1000;
    if (Math.abs(candDuration - targetDuration) > RECORDING_DURATION_TOLERANCE_SEC) continue;

    const posDist = haversineMetres(target.lat, target.lng, c.lat, c.lng);
    if (posDist > RECORDING_POSITION_TOLERANCE_M) continue;

    if (!best || posDist < best.dist) best = { id: c.id, dist: posDist };
  }
  return best?.id ?? null;
}

/**
 * Serializes concurrent uploads from the same submitter within a transaction,
 * closing the check-then-insert race on content_hash/near-duplicate checks.
 * Auto-released at transaction end (xact-scoped).
 */
export async function advisoryLock(tx: Prisma.TransactionClient, lockKey: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;
}
