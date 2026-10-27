import { prisma } from "@/lib/prisma";

export interface UserFilters {
  projectIds: number[];
  farmIds: number[];
  showUnassigned: boolean;
}

export async function getUserFilters(userId: string | null): Promise<UserFilters> {
  if (!userId) return { projectIds: [], farmIds: [], showUnassigned: true };

  const [projects, farms, settings] = await Promise.all([
    prisma.userProjectFilter.findMany({ where: { user_id: userId }, select: { project_id: true } }),
    prisma.userFarmFilter.findMany({ where: { user_id: userId }, select: { farm_id: true } }),
    prisma.userFilterSettings.findUnique({ where: { user_id: userId }, select: { show_unassigned: true } }),
  ]);

  return {
    projectIds: projects.map((p) => p.project_id),
    farmIds: farms.map((f) => f.farm_id),
    showUnassigned: settings?.show_unassigned ?? true,
  };
}

export interface EffectiveScope extends UserFilters {
  /** True only for an Agronomist. UI should hide/disable the self-service
   *  "Dashboard Filters" dialog and explain that access is admin-managed instead. */
  hardScoped: boolean;
  /** Farms this user may open at all: `farmIds` *before* farm-tag filters narrowed it.
   *  Access checks (scopeIncludesFarm, API ceilings) must use this, never `farmIds` —
   *  hiding a tag is a view preference and must not 404 a farm reached by link. Same
   *  empty = unrestricted convention as `farmIds`. */
  accessFarmIds: number[];
  /** True when any farm-tag include/exclude rule is active (User_Farm_Tag_Filters). */
  tagFiltered: boolean;
}

// A serial PK no real row ever has — used to force an empty `{ in: [...] }` filter to
// match zero rows instead of Prisma/every page's existing "no ids selected" ⇒
// unrestricted convention. Keeps every page's `ids.length > 0 ? { in: ids } : {}`
// where-clause pattern correct for both Lab Members (empty = unfiltered) and
// Agronomists (empty = scoped to nothing) with no change to that pattern itself.
const NO_ACCESS_SENTINEL = [-1];

/** Wraps getUserFilters() with the Agronomist hard-scope rule. For an ordinary Lab
 *  Member, UserProjectFilter/UserFarmFilter rows are the optional personal
 *  "Dashboard Filters" preference (self-editable, empty = see everything) exactly as
 *  before. For an Agronomist, the *same* rows — set by an admin via the Admin Panel's
 *  Project Filter dialog, not self-editable — become a hard ceiling: farms are also
 *  derived from the assigned projects' experiments (the Admin Panel only picks
 *  projects, not farms), and an empty result means zero access, not unrestricted
 *  access. Every page that calls this can keep using its existing
 *  `ids.length > 0 ? { in: ids } : {}` where-clause pattern unchanged. */
export async function getEffectiveScope(
  userId: string | null,
  category: string | null | undefined
): Promise<EffectiveScope> {
  const filters = await getUserFilters(userId);
  const base = category !== "agronomist"
    ? { ...filters, hardScoped: false }
    : await agronomistScope(filters);
  return applyFarmTagFilters(userId, base);
}

type BaseScope = Omit<EffectiveScope, "accessFarmIds" | "tagFiltered">;

async function agronomistScope(filters: UserFilters): Promise<BaseScope> {
  let farmIds = filters.farmIds;
  if (filters.projectIds.length > 0) {
    const experiments = await prisma.farmExperiment.findMany({
      where: { project_id: { in: filters.projectIds } },
      select: { farm_id: true },
      distinct: ["farm_id"],
    });
    const derivedFarmIds = experiments
      .map((e) => e.farm_id)
      .filter((id): id is number => id != null);
    farmIds = Array.from(new Set([...farmIds, ...derivedFarmIds]));
  }

  return {
    projectIds: filters.projectIds.length > 0 ? filters.projectIds : NO_ACCESS_SENTINEL,
    farmIds: farmIds.length > 0 ? farmIds : NO_ACCESS_SENTINEL,
    // An Agronomist's scope is a hard boundary, not a convenience filter — never show
    // uploads that haven't been matched to one of their assigned farms.
    showUnassigned: false,
    hardScoped: true,
  };
}

/** Narrows `farmIds` by the user's farm-tag rules: include = farm has ANY included tag,
 *  exclude = farm has none of the excluded tags (exclude wins), both intersected with
 *  whatever farm list the base scope already had. Self-service for every user including
 *  Agronomists — it can only ever narrow their admin-set ceiling, never widen it. A
 *  rule set matching zero farms yields the sentinel, not an empty (= unrestricted) list. */
async function applyFarmTagFilters(userId: string | null, scope: BaseScope): Promise<EffectiveScope> {
  const rules = userId
    ? await prisma.userFarmTagFilter.findMany({ where: { user_id: userId }, select: { tag_id: true, mode: true } })
    : [];
  const include = rules.filter((r) => r.mode === "include").map((r) => r.tag_id);
  const exclude = rules.filter((r) => r.mode === "exclude").map((r) => r.tag_id);

  if (include.length === 0 && exclude.length === 0) {
    return { ...scope, accessFarmIds: scope.farmIds, tagFiltered: false };
  }

  const farms = await prisma.farm.findMany({
    where: {
      AND: [
        ...(scope.farmIds.length > 0 ? [{ id: { in: scope.farmIds } }] : []),
        ...(include.length > 0 ? [{ TagLinks: { some: { tag_id: { in: include } } } }] : []),
        ...(exclude.length > 0 ? [{ TagLinks: { none: { tag_id: { in: exclude } } } }] : []),
      ],
    },
    select: { id: true },
  });
  const ids = farms.map((f) => f.id);

  return {
    ...scope,
    farmIds: ids.length > 0 ? ids : NO_ACCESS_SENTINEL,
    accessFarmIds: scope.farmIds,
    tagFiltered: true,
  };
}

/** For a detail page reached by ID (not a filtered list) — an unscoped user (or a
 *  Lab Member's optional filter) always has access; an Agronomist only if the record
 *  falls within their assigned project(s). Callers should `notFound()` on a false
 *  result — 404, not 403, matching the "don't leak existence" pattern used elsewhere
 *  (e.g. the custom-forms mobile API) rather than confirming the record exists. */
export function scopeIncludesProject(scope: EffectiveScope, projectId: number | null | undefined): boolean {
  if (!scope.hardScoped) return true;
  return projectId != null && scope.projectIds.includes(projectId);
}

export function scopeIncludesFarm(scope: EffectiveScope, farmId: number | null | undefined): boolean {
  if (!scope.hardScoped) return true;
  return farmId != null && scope.accessFarmIds.includes(farmId);
}
