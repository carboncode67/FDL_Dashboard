import fs from "fs";
import { Readable } from "stream";
import { ZipArchive } from "archiver";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPipelineRequest } from "@/lib/pipeline-requests-route";
import { attachmentPath, skeletonYaml } from "@/lib/pipeline-requests";

// GET: the request as a skeleton pipeline.yaml (anyone in the lab).
// ?zip=1: <key>/pipeline.yaml plus <key>/attachments/* in one zip.
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPipelineRequest((await params).id, async ({ request }) => {
    const r = await prisma.pipelineRequest.findUniqueOrThrow({
      where: { id: request!.id },
      include: { RequestedBy: { select: { name: true, email: true } }, Attachments: { orderBy: { created_at: "asc" } } },
    });
    const text = skeletonYaml(r);
    const headers = { "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" };
    if (new URL(req.url).searchParams.get("zip") !== "1") {
      return new NextResponse(text, {
        headers: { ...headers, "Content-Type": "application/yaml; charset=utf-8", "Content-Disposition": `attachment; filename="${r.pipeline_key}.pipeline.yaml"` },
      });
    }
    const zip = new ZipArchive({ zlib: { level: 6 } });
    zip.append(text, { name: `${r.pipeline_key}/pipeline.yaml` });
    const used = new Set<string>();
    for (const a of r.Attachments) {
      const p = attachmentPath(r.id, a.stored_name);
      if (!fs.existsSync(p)) continue;
      let name = a.original_name.replace(/[/\\]/g, "_");
      if (used.has(name)) name = `${a.id}-${name}`;
      used.add(name);
      zip.file(p, { name: `${r.pipeline_key}/attachments/${name}` });
    }
    zip.finalize();
    return new NextResponse(Readable.toWeb(zip as unknown as Readable) as unknown as ReadableStream, {
      headers: { ...headers, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${r.pipeline_key}.zip"` },
    });
  });
}
