import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Inline Levenshtein distance for server-side fuzzy matching (no deps)
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a.toLowerCase(), b.toLowerCase()) / maxLen;
}

const THRESHOLD = 0.85;

type DuplicateResult = { id: number | string; name: string };

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entity = searchParams.get("entity");
  const name   = searchParams.get("name")?.trim();

  if (!name) return NextResponse.json({ duplicates: [] });

  let results: DuplicateResult[] = [];

  switch (entity) {
    case "farms": {
      const rows = await prisma.farm.findMany({
        where: { Farm_Name: { contains: name, mode: "insensitive" } },
        select: { id: true, Farm_Name: true },
      });
      results = rows
        .filter((r) => r.Farm_Name && similarity(name, r.Farm_Name) >= THRESHOLD)
        .map((r) => ({ id: r.id, name: r.Farm_Name! }));
      break;
    }
    case "contacts": {
      const rows = await prisma.contact.findMany({
        where: { name: { contains: name, mode: "insensitive" } },
        select: { id: true, name: true },
      });
      results = rows
        .filter((r) => similarity(name, r.name) >= THRESHOLD)
        .map((r) => ({ id: r.id, name: r.name }));
      break;
    }
    case "projects": {
      const rows = await prisma.project.findMany({
        where: { Project_Name: { contains: name, mode: "insensitive" } },
        select: { id: true, Project_Name: true },
      });
      results = rows
        .filter((r) => r.Project_Name && similarity(name, r.Project_Name) >= THRESHOLD)
        .map((r) => ({ id: r.id, name: r.Project_Name! }));
      break;
    }
    case "tests": {
      const rows = await prisma.test.findMany({
        where: { Test_Name: { contains: name, mode: "insensitive" } },
        select: { id: true, Test_Name: true },
      });
      results = rows
        .filter((r) => r.Test_Name && similarity(name, r.Test_Name) >= THRESHOLD)
        .map((r) => ({ id: r.id, name: r.Test_Name! }));
      break;
    }
    case "drones": {
      const rows = await prisma.drone.findMany({
        where: { Name: { contains: name, mode: "insensitive" } },
        select: { id: true, Name: true },
      });
      results = rows
        .filter((r) => r.Name && similarity(name, r.Name) >= THRESHOLD)
        .map((r) => ({ id: r.id, name: r.Name! }));
      break;
    }
    case "treatments": {
      const rows = await prisma.treatment.findMany({
        where: { Treatment_Name: { contains: name, mode: "insensitive" } },
        select: { id: true, Treatment_Name: true },
      });
      results = rows
        .filter((r) => r.Treatment_Name && similarity(name, r.Treatment_Name) >= THRESHOLD)
        .map((r) => ({ id: r.id, name: r.Treatment_Name! }));
      break;
    }
    case "crops": {
      const rows = await prisma.crop.findMany({
        where: { Crop_Name: { contains: name, mode: "insensitive" } },
        select: { id: true, Crop_Name: true },
      });
      results = rows
        .filter((r) => r.Crop_Name && similarity(name, r.Crop_Name) >= THRESHOLD)
        .map((r) => ({ id: r.id, name: r.Crop_Name! }));
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown entity" }, { status: 400 });
  }

  return NextResponse.json({ duplicates: results });
}
