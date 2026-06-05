import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";

export async function GET(req: Request) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.toLowerCase();

  const farms = await prisma.farm.findMany({
    select: {
      id: true,
      Farm_Name: true,
      title: true,
      ProjectFarms: { select: { Projects_id: true, Project: { select: { id: true, Project_Name: true } } } },
    },
    orderBy: { Farm_Name: "asc" },
  });

  const filtered = q
    ? farms.filter(
        (f) =>
          f.Farm_Name?.toLowerCase().includes(q) ||
          f.title?.toLowerCase().includes(q)
      )
    : farms;

  const results = filtered.map(({ ProjectFarms, ...f }) => ({
    ...f,
    projects: ProjectFarms.map((pf) => ({ id: pf.Project.id, name: pf.Project.Project_Name })),
  }));

  return NextResponse.json(results);
}

export async function POST(req: Request) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { Farm_Name, Farmer_Name, Contact_Phone, Contact_Email, County, State, title } = body;
  if (!Farm_Name) return NextResponse.json({ error: "Farm_Name is required" }, { status: 400 });

  const farm = await prisma.farm.create({
    data: { Farm_Name, County, State, title },
  });

  if (Farmer_Name) {
    await prisma.contact.create({
      data: { name: Farmer_Name, phone: Contact_Phone ?? null, email: Contact_Email ?? null, farms_id: farm.id, is_lab_member: false, token: "" },
    });
  }

  return NextResponse.json(farm, { status: 201 });
}
