/**
 * The allowlist for "restricted" bearer-token identities — Contacts (always
 * restricted) and public.users rows that aren't flagged is_service_account
 * (see migration 068). Enforced in lib/upload-auth.ts's authenticateUpload(),
 * the single choke point every bearer-token route already goes through, so
 * nothing here needs to be duplicated per-route.
 *
 * Derived directly from what the Swift and Kotlin mobile apps actually call
 * (FarmerDataLogger/{swift,kotlin}'s Upload/Forms/SamplingMaps/Geofences
 * service files) — not a guess. Everything else currently reachable via
 * bearer token (farms/fields/zones/experiments read+write, uploads
 * list/manifest/patch, /api/data/projects, /api/data/search,
 * upload-categories, experiment-tests rows, file downloads, farm
 * summary/transcript) is what OFE_Dashboard's lib/fdl-sync.ts, the Client
 * tools, and onboarding_pipeline.py use — service-only, requires
 * is_service_account = true.
 *
 * Pattern segments starting with ":" match exactly one path segment (no
 * slashes) — e.g. ":id" matches "42" or "abc-123" but not "42/points".
 */
export interface RouteScope {
  method: string;
  pattern: string;
}

export const RESTRICTED_ALLOWED_ROUTES: RouteScope[] = [
  // Uploads — the core "uploading only" allowance.
  { method: "POST", pattern: "/api/upload/photo" },
  { method: "POST", pattern: "/api/upload/recording" },
  { method: "POST", pattern: "/api/upload/note" },
  { method: "POST", pattern: "/api/upload/location" },
  { method: "POST", pattern: "/api/upload/video" },
  { method: "POST", pattern: "/api/upload/document" },
  { method: "POST", pattern: "/api/upload/contact-card" },

  // Forms — pull assigned forms, submit responses, view own submission history.
  { method: "GET", pattern: "/api/data/forms" },
  { method: "GET", pattern: "/api/data/forms/:id" },
  { method: "POST", pattern: "/api/data/forms/:id/responses" },
  { method: "GET", pattern: "/api/data/forms/:id/responses" },

  // Sampling maps — pull assigned maps, submit field points/collections.
  { method: "GET", pattern: "/api/data/sampling-maps" },
  { method: "GET", pattern: "/api/data/sampling-maps/:id" },
  { method: "POST", pattern: "/api/data/sampling-maps/:id/points" },
  { method: "GET", pattern: "/api/data/sampling-maps/:id/points/status" },
  { method: "POST", pattern: "/api/data/sampling-maps/points/:pointId/collections" },

  // Geofences — pull assigned zones, report entry events (spatial notifications).
  { method: "GET", pattern: "/api/data/geofences" },
  { method: "POST", pattern: "/api/data/geofences/:id/events" },
];

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .split("/")
    .map((seg) => (seg.startsWith(":") ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${escaped}$`);
}

const COMPILED_ROUTES = RESTRICTED_ALLOWED_ROUTES.map((r) => ({
  method: r.method,
  regex: patternToRegExp(r.pattern),
}));

/** True if a restricted identity is allowed to make this request. */
export function isRouteAllowedForRestricted(method: string, pathname: string): boolean {
  return COMPILED_ROUTES.some((r) => r.method === method && r.regex.test(pathname));
}
