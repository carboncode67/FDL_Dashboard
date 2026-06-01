import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const drones = await prisma.drone.findMany({ orderBy: { id: "asc" } });
  return NextResponse.json(drones);
}

export async function POST(req: Request) {
  const body = await req.json();
  const drone = await prisma.drone.create({ data: body });
  return NextResponse.json(drone, { status: 201 });
}
