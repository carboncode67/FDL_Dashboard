import { PrismaClient } from "@prisma/client";
import { basePrisma, tenantContext } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * Planned Changes #10/#13 — lab data silo. See docs/lab-data-silo-plan.md,
 * particularly §5 (this file + lib/prisma.ts) and §9 Phase 2/3.
 *
 * The load-bearing primitive here is `runWithLab()`. It binds the right
 * Prisma client into lib/prisma.ts's AsyncLocalStorage for the duration of a
 * callback, so every *existing* `import { prisma } from "@/lib/prisma"` call
 * site — including ones buried inside shared lib/*.ts helpers that were never
 * touched — automatically resolves to the correct lab's connection. Route
 * handlers and server pages wrap their body in it; nothing inside the body
 * needs to change.
 *
 * TENANT_ENFORCEMENT gates how real any of this is:
 *   "off"  (default) — runWithLab() is a no-op passthrough; `prisma` behaves
 *          exactly like the old plain singleton. Zero behavior change from
 *          before this feature existed. Only mode until Phase 3 provisions
 *          real per-lab roles in a given environment.
 *   "soft" — same connection as "off" (no real per-lab credentials yet), but
 *          wrapped with a result-shape audit that logs when a query's result
 *          carries a lab_id different from the expected lab. Coarse smoke
 *          signal (only catches models whose top-level result has a lab_id
 *          field) — not a substitute for RLS, just proof the plumbing is
 *          wired correctly before "hard". Expect zero violations logged.
 *   "hard" — real per-lab connection strings are required
 *          (DATABASE_URL__<SLUG>); a missing one, or a null lab where one is
 *          required, throws instead of silently falling back. RLS policies
 *          (Phase 3) are the actual boundary at this point — this file just
 *          gets the app connecting through the right role.
 */
export type TenantEnforcement = "off" | "soft" | "hard";

export function tenantEnforcement(): TenantEnforcement {
  const v = process.env.TENANT_ENFORCEMENT;
  return v === "soft" || v === "hard" ? v : "off";
}

const labClients = new Map<string, PrismaClient>();

function envVarNameForLab(slug: string): string {
  return `DATABASE_URL__${slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

/**
 * The connection scoped to one lab's Postgres role (see sql/roles/). Cached
 * per slug for the life of the process — same singleton-per-key pattern as
 * lib/prisma.ts, needed so dev hot-reload doesn't leak a client per edit.
 * Rarely called directly — prefer runWithLab().
 */
export function getLabPrisma(slug: string): PrismaClient {
  const mode = tenantEnforcement();
  if (mode === "off") return basePrisma;

  const envVar = envVarNameForLab(slug);
  const url = process.env[envVar];
  if (!url) {
    if (mode === "hard") {
      throw new Error(
        `Lab "${slug}" has no configured database connection (${envVar} is unset). ` +
          `Provision its role (sql/roles/create_lab_role.sql.template) and set ${envVar} before TENANT_ENFORCEMENT=hard.`
      );
    }
    // soft mode with no real credentials yet — fall back so the app keeps working
    // while the rest of Phase 2/3 lands. Not cached: intentionally cheap so it
    // doesn't leave a misleadingly-named entry in labClients.
    return basePrisma;
  }

  const cached = labClients.get(slug);
  if (cached) return cached;

  const client = new PrismaClient({ datasourceUrl: url, log: ["error"] });
  labClients.set(slug, client);
  return client;
}

/**
 * The single BYPASSRLS, SELECT-only connection for platform-admin cross-lab
 * views (§6). Falls back to the base singleton until DATABASE_URL__PLATFORM
 * is set (Phase 3) — always, regardless of TENANT_ENFORCEMENT, since the
 * platform tier doesn't exist yet (Phase 4) and there's nothing to protect
 * against before then.
 */
let platformClient: PrismaClient | null = null;

export function getPlatformPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL__PLATFORM;
  if (!url) return basePrisma;
  if (!platformClient) {
    platformClient = new PrismaClient({ datasourceUrl: url, log: ["error"] });
  }
  return platformClient;
}

const labSlugById = new Map<number, string>();
const labIdBySlug = new Map<string, number>();

async function loadLab(where: { id: number } | { slug: string }): Promise<{ id: number; slug: string } | null> {
  const lab = await basePrisma.lab.findUnique({ where, select: { id: true, slug: true } });
  if (!lab) return null;
  labSlugById.set(lab.id, lab.slug);
  labIdBySlug.set(lab.slug, lab.id);
  return lab;
}

/**
 * Resolves a lab id (e.g. from a bearer-token's Contact/User row) to its
 * slug, via the base (nocodb) connection — this lookup has to span every lab,
 * so it can never go through a lab-scoped client itself. Small in-memory
 * cache since labs change rarely and this is on the hot path for every
 * bearer-token request. Returns null for a null id (not yet backfilled) or an
 * unknown one, rather than throwing — callers fall back to the unscoped
 * client via runWithLab(null, ...), matching TENANT_ENFORCEMENT="off" behavior.
 */
export async function resolveLabSlug(labId: number | null | undefined): Promise<string | null> {
  if (labId == null) return null;
  const cached = labSlugById.get(labId);
  if (cached) return cached;
  return (await loadLab({ id: labId }))?.slug ?? null;
}

/** Inverse of resolveLabSlug() — used by the soft-mode audit, which needs a
 *  numeric lab_id to compare against query results. */
async function resolveLabId(slug: string): Promise<number | null> {
  const cached = labIdBySlug.get(slug);
  if (cached != null) return cached;
  return (await loadLab({ slug }))?.id ?? null;
}

/**
 * "soft" mode's audit: wraps a client so any query result carrying a top-level
 * `lab_id` (or array of such) that doesn't match `expectedLabId` gets logged
 * instead of silently returned. Deliberately coarse — it only sees the
 * immediate result shape, not joined/nested records — this is a smoke signal
 * for "did we wire the right lab into this request", not a security boundary.
 * With one lab today, the expected violation count is zero; see §9 Phase 2.
 */
function withSoftModeAudit<T extends PrismaClient>(client: T, expectedLabId: number): T {
  function checkRow(row: unknown, model: string, operation: string) {
    if (row && typeof row === "object" && "lab_id" in row) {
      const rowLabId = (row as { lab_id: unknown }).lab_id;
      if (typeof rowLabId === "number" && rowLabId !== expectedLabId) {
        console.warn(
          `[TENANT_ENFORCEMENT=soft] ${model}.${operation} returned lab_id=${rowLabId}, ` +
            `expected ${expectedLabId}. This should never happen with one lab — investigate ` +
            `before enabling TENANT_ENFORCEMENT=hard.`
        );
      }
    }
  }

  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);
          if (Array.isArray(result)) {
            for (const row of result) checkRow(row, model, operation);
          } else {
            checkRow(result, model, operation);
          }
          return result;
        },
      },
    },
  }) as unknown as T;
}

/**
 * THE primitive server pages / API route handlers / the scheduler / webhooks
 * should wrap their body in. Binds the resolved lab's Prisma client into
 * AsyncLocalStorage (lib/prisma.ts) for the duration of `fn`, so every
 * `import { prisma } from "@/lib/prisma"` call inside — at any depth —
 * resolves to the right connection.
 *
 *   export async function GET(req: Request) {
 *     const auth = await authenticateUpload(req);
 *     if ("error" in auth) return auth.error;
 *     return runWithLab(auth.labSlug, async () => {
 *       // ...unchanged body, `prisma` from "@/lib/prisma" is now lab-scoped...
 *     });
 *   }
 *
 * `labSlug: null` is valid and means "no enforcement for this call" — the
 * body runs against the base connection in "off"/"soft" mode, and throws in
 * "hard" mode (every session-authed user has a lab by then; a null slug on a
 * bearer token indicates a genuinely unmigrated/broken credential).
 */
export async function runWithLab<T>(labSlug: string | null, fn: () => Promise<T>): Promise<T> {
  const mode = tenantEnforcement();
  if (mode === "off") return fn();

  if (!labSlug) {
    if (mode === "hard") {
      throw new Error(
        "runWithLab() called with no lab while TENANT_ENFORCEMENT=hard. Every session-authed " +
          "user and bearer-token credential must resolve to a lab by then (migration 068 makes " +
          "users.lab_id NOT NULL) — this indicates a missed migration step or a stale JWT " +
          "(ask the user to sign out/in)."
      );
    }
    return fn();
  }

  let client = getLabPrisma(labSlug);
  if (mode === "soft") {
    const labId = await resolveLabId(labSlug);
    if (labId != null) client = withSoftModeAudit(client, labId);
  }
  return tenantContext.run(client, fn);
}

/** Convenience wrapper for session-authed pages/routes that haven't already
 *  called auth() themselves. Prefer `runWithLab(session.user.lab_slug, fn)`
 *  directly when you already have `session`, to avoid resolving it twice. */
export async function runWithTenant<T>(fn: () => Promise<T>): Promise<T> {
  const session = await auth();
  return runWithLab(session?.user?.lab_slug ?? null, fn);
}
