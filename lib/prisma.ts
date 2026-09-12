import { PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";

const globalForPrisma = globalThis as unknown as {
  prismaBase: PrismaClient | undefined;
};

// The plain, nocodb-backed connection — unchanged from before Planned Changes
// #10. Table owner, superuser, bypasses RLS by design (see
// docs/lab-data-silo-plan.md §3). Use this directly only for code that must
// genuinely span every lab: auth.ts's credential lookup (you don't know a
// user's lab until you've found their row), lib/lab-db.ts's own slug
// resolution, and migrations tooling. Everything else should keep using the
// `prisma` export below.
export const basePrisma =
  globalForPrisma.prismaBase ??
  new PrismaClient({
    log: ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = basePrisma;

/**
 * Carries the current request's tenant-scoped Prisma client through any depth
 * of `await`ed calls, including into shared lib/*.ts helpers that were never
 * touched to know about labs. Set by lib/lab-db.ts's `runWithLab()` at each
 * request entry point (a page, an API route handler, the scheduler, a
 * webhook); empty means "use the base connection" — i.e.
 * TENANT_ENFORCEMENT=off, or code running outside a request (scripts).
 *
 * AsyncLocalStorage (not a plain module-level variable) specifically because
 * Next.js can process concurrent requests for different labs in the same
 * process — a mutable shared variable would race between them.
 */
export const tenantContext = new AsyncLocalStorage<PrismaClient>();

/**
 * What ~every existing `import { prisma } from "@/lib/prisma"` call site uses.
 * A Proxy so each property access re-resolves against whichever client is
 * active for the current async context — no call site (including ones deep
 * inside shared lib modules like lib/search.ts or lib/data-api.ts) needs to
 * change for this to work, as long as the request entry point ran inside
 * `runWithLab()`. Outside of any such wrapper (TENANT_ENFORCEMENT=off,
 * scripts, or code that legitimately shouldn't be lab-scoped) this behaves
 * exactly like `basePrisma`.
 */
export const prisma: PrismaClient = new Proxy(basePrisma, {
  get(target, prop) {
    const active = tenantContext.getStore() ?? target;
    const value = Reflect.get(active as object, prop, active);
    return typeof value === "function" ? value.bind(active) : value;
  },
}) as PrismaClient;
