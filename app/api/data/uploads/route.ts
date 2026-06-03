import { NextResponse } from "next/server";
import { authenticateUpload } from "@/lib/upload-auth";
import { queryAllUploads, parseQueryParams } from "@/lib/data-api";

export async function GET(req: Request) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const { limit, offset, ...queryOpts } = parseQueryParams(new URL(req.url));
  const all = await queryAllUploads(queryOpts);
  const items = all.slice(offset, offset + limit);

  return NextResponse.json({ total: all.length, limit, offset, items });
}
