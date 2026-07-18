import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const projects = await prisma.project.findMany({
    select: { id: true, Project_Name: true, title: true },
    orderBy: { Project_Name: "asc" },
  });

  const memberIds = new Set<number>();
  if (auth.kind === "labMember") {
    const memberships = await prisma.projectLabMember.findMany({
      where: { user_id: auth.labMember.id },
      select: { Projects_id: true },
    });
    for (const m of memberships) memberIds.add(m.Projects_id);
  }

  const results = projects.map((p) => ({
    id: p.id,
    name: p.Project_Name ?? p.title ?? `Project ${p.id}`,
    is_member: memberIds.has(p.id),
  }));

  return NextResponse.json(results);
}
