import { prisma } from "@/lib/prisma";

/**
 * Whole-DB keyword search (Planned Changes #82). Shared by the session-auth
 * GUI route (/api/search) and the bearer-token Data API route
 * (/api/data/search) so the dashboard and external agents query identically.
 *
 * Case-insensitive substring match across a curated set of text columns per
 * entity. Snippets show the match in context; hits carry the dashboard URL
 * and (where known) farm_id/project_id so agents can chain follow-up queries.
 */

export interface SearchHit {
  entity: string;
  id: number;
  title: string;
  context: string | null;
  matched_field: string;
  snippet: string;
  url: string;
  farm_id: number | null;
  project_id: number | null;
}

export const SEARCH_ENTITIES = [
  "farms",
  "experiments",
  "projects",
  "contacts",
  "fields",
  "tests",
  "treatments",
  "tasks",
  "uploads",
] as const;
export type SearchEntity = (typeof SEARCH_ENTITIES)[number];

const PER_ENTITY_CAP = 15;
const SNIPPET_RADIUS = 60;

function snippet(value: string, q: string): string {
  const idx = value.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return value.slice(0, SNIPPET_RADIUS * 2);
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(value.length, idx + q.length + SNIPPET_RADIUS);
  return (
    (start > 0 ? "…" : "") +
    value.slice(start, end).replace(/\s+/g, " ") +
    (end < value.length ? "…" : "")
  );
}

/** First searched column whose value contains q → [field, snippet]. */
function firstMatch(
  q: string,
  fields: Record<string, string | null | undefined>,
): [string, string] {
  for (const [name, value] of Object.entries(fields)) {
    if (value && value.toLowerCase().includes(q.toLowerCase())) {
      return [name, snippet(value, q)];
    }
  }
  const [name, value] = Object.entries(fields)[0] ?? ["", ""];
  return [name, (value ?? "").slice(0, SNIPPET_RADIUS * 2)];
}

const contains = (q: string) => ({ contains: q, mode: "insensitive" as const });

async function searchFarms(q: string): Promise<SearchHit[]> {
  const rows = await prisma.farm.findMany({
    where: {
      OR: [
        { Farm_Name: contains(q) },
        { title: contains(q) },
        { address: contains(q) },
        { farm_summary: contains(q) },
      ],
    },
    select: { id: true, Farm_Name: true, title: true, address: true, farm_summary: true },
    take: PER_ENTITY_CAP,
  });
  return rows.map((r) => {
    const [field, snip] = firstMatch(q, {
      Farm_Name: r.Farm_Name,
      title: r.title,
      address: r.address,
      farm_summary: r.farm_summary,
    });
    return {
      entity: "farms",
      id: r.id,
      title: r.Farm_Name || r.title || `Farm ${r.id}`,
      context: null,
      matched_field: field,
      snippet: snip,
      url: `/farms/${r.id}`,
      farm_id: r.id,
      project_id: null,
    };
  });
}

async function searchExperiments(q: string): Promise<SearchHit[]> {
  const rows = await prisma.farmExperiment.findMany({
    where: {
      OR: [
        { experiment_name: contains(q) },
        { hypothesis: contains(q) },
        { experiment_desc: contains(q) },
        { measurements: contains(q) },
        { criteria: contains(q) },
        { lab_description: contains(q) },
      ],
    },
    select: {
      id: true,
      farm_id: true,
      project_id: true,
      experiment_name: true,
      hypothesis: true,
      experiment_desc: true,
      measurements: true,
      criteria: true,
      lab_description: true,
      Farm: { select: { Farm_Name: true, title: true } },
    },
    take: PER_ENTITY_CAP,
  });
  return rows.map((r) => {
    const [field, snip] = firstMatch(q, {
      experiment_name: r.experiment_name,
      hypothesis: r.hypothesis,
      experiment_desc: r.experiment_desc,
      measurements: r.measurements,
      criteria: r.criteria,
      lab_description: r.lab_description,
    });
    return {
      entity: "experiments",
      id: r.id,
      title: r.experiment_name || `Experiment ${r.id}`,
      context: r.Farm?.Farm_Name || r.Farm?.title || null,
      matched_field: field,
      snippet: snip,
      url: r.farm_id ? `/farms/${r.farm_id}/experiments` : "/experiments",
      farm_id: r.farm_id,
      project_id: r.project_id,
    };
  });
}

async function searchProjects(q: string): Promise<SearchHit[]> {
  const rows = await prisma.project.findMany({
    where: {
      OR: [
        { Project_Name: contains(q) },
        { title: contains(q) },
        { Project_Sponsors: contains(q) },
      ],
    },
    select: { id: true, Project_Name: true, title: true, Project_Sponsors: true },
    take: PER_ENTITY_CAP,
  });
  return rows.map((r) => {
    const [field, snip] = firstMatch(q, {
      Project_Name: r.Project_Name,
      title: r.title,
      Project_Sponsors: r.Project_Sponsors,
    });
    return {
      entity: "projects",
      id: r.id,
      title: r.Project_Name || r.title || `Project ${r.id}`,
      context: null,
      matched_field: field,
      snippet: snip,
      url: `/projects/${r.id}`,
      farm_id: null,
      project_id: r.id,
    };
  });
}

async function searchContacts(q: string): Promise<SearchHit[]> {
  const rows = await prisma.contact.findMany({
    where: { OR: [{ name: contains(q) }, { email: contains(q) }, { phone: contains(q) }] },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      farms_id: true,
      Farm: { select: { Farm_Name: true, title: true } },
    },
    take: PER_ENTITY_CAP,
  });
  return rows.map((r) => {
    const [field, snip] = firstMatch(q, { name: r.name, email: r.email, phone: r.phone });
    return {
      entity: "contacts",
      id: r.id,
      title: r.name,
      context: r.Farm?.Farm_Name || r.Farm?.title || null,
      matched_field: field,
      snippet: snip,
      url: `/contacts/${r.id}`,
      farm_id: r.farms_id,
      project_id: null,
    };
  });
}

async function searchFields(q: string): Promise<SearchHit[]> {
  const rows = await prisma.field.findMany({
    where: { Name: contains(q) },
    select: {
      id: true,
      Name: true,
      Farms_id: true,
      Farm: { select: { Farm_Name: true, title: true } },
    },
    take: PER_ENTITY_CAP,
  });
  return rows.map((r) => ({
    entity: "fields",
    id: r.id,
    title: r.Name || `Field ${r.id}`,
    context: r.Farm?.Farm_Name || r.Farm?.title || null,
    matched_field: "Name",
    snippet: r.Name ?? "",
    url: `/fields/${r.id}`,
    farm_id: r.Farms_id,
    project_id: null,
  }));
}

async function searchTests(q: string): Promise<SearchHit[]> {
  const rows = await prisma.test.findMany({
    where: {
      OR: [
        { Test_Name: contains(q) },
        { Test_Description: contains(q) },
        { Methodology: contains(q) },
        { Data_Processing_Instructions: contains(q) },
      ],
    },
    select: {
      id: true,
      Test_Name: true,
      Test_Description: true,
      Methodology: true,
      Data_Processing_Instructions: true,
    },
    take: PER_ENTITY_CAP,
  });
  return rows.map((r) => {
    const [field, snip] = firstMatch(q, {
      Test_Name: r.Test_Name,
      Test_Description: r.Test_Description,
      Methodology: r.Methodology,
      Data_Processing_Instructions: r.Data_Processing_Instructions,
    });
    return {
      entity: "tests",
      id: r.id,
      title: r.Test_Name || `Test ${r.id}`,
      context: null,
      matched_field: field,
      snippet: snip,
      url: `/tests/${r.id}`,
      farm_id: null,
      project_id: null,
    };
  });
}

async function searchTreatments(q: string): Promise<SearchHit[]> {
  const rows = await prisma.treatment.findMany({
    where: {
      OR: [
        { Treatment_Name: contains(q) },
        { Description: contains(q) },
        { Notes: contains(q) },
      ],
    },
    select: { id: true, Treatment_Name: true, Description: true, Notes: true },
    take: PER_ENTITY_CAP,
  });
  return rows.map((r) => {
    const [field, snip] = firstMatch(q, {
      Treatment_Name: r.Treatment_Name,
      Description: r.Description,
      Notes: r.Notes,
    });
    return {
      entity: "treatments",
      id: r.id,
      title: r.Treatment_Name || `Treatment ${r.id}`,
      context: null,
      matched_field: field,
      snippet: snip,
      url: `/treatments/${r.id}`,
      farm_id: null,
      project_id: null,
    };
  });
}

async function searchTasks(q: string): Promise<SearchHit[]> {
  const rows = await prisma.task.findMany({
    where: { OR: [{ description: contains(q) }, { classification: contains(q) }] },
    select: {
      id: true,
      description: true,
      classification: true,
      Experiment: {
        select: { farm_id: true, experiment_name: true, Farm: { select: { Farm_Name: true } } },
      },
    },
    take: PER_ENTITY_CAP,
  });
  return rows.map((r) => {
    const [field, snip] = firstMatch(q, {
      description: r.description,
      classification: r.classification,
    });
    return {
      entity: "tasks",
      id: r.id,
      title: r.description.slice(0, 80),
      context: r.Experiment?.experiment_name || r.Experiment?.Farm?.Farm_Name || null,
      matched_field: field,
      snippet: snip,
      url: `/tasks/${r.id}`,
      farm_id: r.Experiment?.farm_id ?? null,
      project_id: null,
    };
  });
}

const UPLOAD_MODELS = [
  {
    slug: "photos",
    model: () => prisma.photo,
    text: ["filename", "category", "description", "note"],
  },
  {
    slug: "notes",
    model: () => prisma.note,
    text: ["content", "category", "description"],
  },
  {
    slug: "recordings",
    model: () => prisma.recording,
    text: ["filename", "category", "description"],
  },
  {
    slug: "locations",
    model: () => prisma.location,
    text: ["name", "category", "description"],
  },
  {
    slug: "lab-member-uploads",
    model: () => prisma.labMemberUpload,
    text: ["filename", "content", "category", "description"],
  },
] as const;

async function searchUploads(q: string): Promise<SearchHit[]> {
  const perTable = await Promise.all(
    UPLOAD_MODELS.map(async ({ slug, model, text }) => {
      // The five upload models share the searched columns but Prisma types
      // them separately, so the query is built dynamically.
      const delegate = model() as unknown as {
        findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
      };
      const rows = await delegate.findMany({
        where: { OR: text.map((f) => ({ [f]: contains(q) })) },
        select: {
          id: true,
          farm_id: true,
          project_id: true,
          ...Object.fromEntries(text.map((f) => [f, true])),
          Farm: { select: { Farm_Name: true, title: true } },
        },
        take: PER_ENTITY_CAP,
      });
      return rows.map((r): SearchHit => {
        const values = Object.fromEntries(
          text.map((f) => [f, r[f] as string | null]),
        );
        const [field, snip] = firstMatch(q, values);
        const farm = r.Farm as { Farm_Name: string | null; title: string | null } | null;
        return {
          entity: "uploads",
          id: r.id as number,
          title: (r.filename as string) || (r.name as string) || `${slug}/${r.id}`,
          context: farm?.Farm_Name || farm?.title || slug,
          matched_field: `${slug}.${field}`,
          snippet: snip,
          url: `/data-sorting/${slug}/${r.id}`,
          farm_id: (r.farm_id as number | null) ?? null,
          project_id: (r.project_id as number | null) ?? null,
        };
      });
    }),
  );
  return perTable.flat().slice(0, PER_ENTITY_CAP);
}

const SEARCHERS: Record<SearchEntity, (q: string) => Promise<SearchHit[]>> = {
  farms: searchFarms,
  experiments: searchExperiments,
  projects: searchProjects,
  contacts: searchContacts,
  fields: searchFields,
  tests: searchTests,
  treatments: searchTreatments,
  tasks: searchTasks,
  uploads: searchUploads,
};

export async function searchAll(
  q: string,
  opts: { entities?: SearchEntity[]; limit?: number } = {},
): Promise<SearchHit[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const entities = opts.entities?.length ? opts.entities : [...SEARCH_ENTITIES];
  const limit = Math.min(opts.limit ?? 50, 200);
  const groups = await Promise.all(entities.map((e) => SEARCHERS[e](query)));
  // Title matches float above body-text matches within the entity ordering
  const hits = groups.flat();
  hits.sort((a, b) => {
    const aTitle = a.title.toLowerCase().includes(query.toLowerCase()) ? 0 : 1;
    const bTitle = b.title.toLowerCase().includes(query.toLowerCase()) ? 0 : 1;
    if (aTitle !== bTitle) return aTitle - bTitle;
    return entities.indexOf(a.entity as SearchEntity) - entities.indexOf(b.entity as SearchEntity);
  });
  return hits.slice(0, limit);
}

export function parseEntitiesParam(raw: string | null): SearchEntity[] | undefined {
  if (!raw) return undefined;
  const wanted = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is SearchEntity => (SEARCH_ENTITIES as readonly string[]).includes(s));
  return wanted.length ? wanted : undefined;
}
