import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import fs from "fs"
import path from "path"

export const runtime = "nodejs"

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const farmId = parseInt(id)
  if (isNaN(farmId)) return NextResponse.json({ error: "Invalid farm id" }, { status: 400 })

  const contacts = await prisma.contact.findMany({
    where: { farms_id: farmId },
    select: {
      id: true,
      name: true,
      Recordings: {
        where: { gps_filename: { not: null } },
        select: { id: true, gps_filename: true, start_time: true },
      },
      Locations: {
        where: { track_filename: { not: null } },
        select: { id: true, track_filename: true, name: true, start_time: true },
      },
    },
  })

  const features: object[] = []

  for (const contact of contacts) {
    for (const rec of contact.Recordings) {
      if (!rec.gps_filename) continue
      const filePath = path.join(DATA_DIR, "recordings", rec.gps_filename)
      try {
        const raw = fs.readFileSync(filePath, "utf-8")
        const parsed = JSON.parse(raw)
        const geometry = parsed.type === "Feature" ? parsed.geometry : parsed
        if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) continue
        features.push({
          type: "Feature",
          geometry,
          properties: {
            contactName: contact.name,
            startTime: rec.start_time?.toISOString() ?? null,
            kind: "recording",
          },
        })
      } catch {
        // skip unreadable or malformed files
      }
    }

    for (const loc of contact.Locations) {
      if (!loc.track_filename) continue
      const filePath = path.join(DATA_DIR, "locations", loc.track_filename)
      try {
        const raw = fs.readFileSync(filePath, "utf-8")
        const parsed = JSON.parse(raw)
        const geometry = parsed.type === "Feature" ? parsed.geometry : parsed
        if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) continue
        features.push({
          type: "Feature",
          geometry,
          properties: {
            contactName: contact.name,
            startTime: loc.start_time?.toISOString() ?? null,
            kind: "location",
            name: loc.name ?? null,
          },
        })
      } catch {
        // skip unreadable or malformed files
      }
    }
  }

  return NextResponse.json({ type: "FeatureCollection", features })
}
