// Shared by the farm-tag API routes and the client components — no Prisma import here,
// so client code can use tagColorClass() too.

export const MAX_TAG_NAME_LENGTH = 40;

export interface FarmTagOption {
  id: number;
  name: string;
}

/** Trims and collapses whitespace; null if empty or too long. Uniqueness is case-insensitive
 *  per lab (uq_farm_tags_lab_name), so callers look up an existing tag by `mode: "insensitive"`
 *  before creating. */
export function normalizeTagName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_TAG_NAME_LENGTH) return null;
  return name;
}

// Colour is derived from the tag id rather than stored — stable per tag, no picker to build.
const TAG_COLORS = [
  "bg-green-100 text-green-800 border-green-200",
  "bg-sky-100 text-sky-800 border-sky-200",
  "bg-amber-100 text-amber-800 border-amber-200",
  "bg-violet-100 text-violet-800 border-violet-200",
  "bg-rose-100 text-rose-800 border-rose-200",
  "bg-teal-100 text-teal-800 border-teal-200",
  "bg-orange-100 text-orange-800 border-orange-200",
  "bg-indigo-100 text-indigo-800 border-indigo-200",
];

export function tagColorClass(tagId: number): string {
  return TAG_COLORS[tagId % TAG_COLORS.length];
}
