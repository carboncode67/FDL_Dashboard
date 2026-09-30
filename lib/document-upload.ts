import fs from "fs";
import path from "path";
import { Readable } from "stream";
import Busboy from "busboy";

// Shared by the farm/project/test Document upload routes. Streamed to disk with busboy, never
// buffered in the Node heap while the file is in flight — same reasoning as the recording and
// basemap upload routes. Documents previously used `req.formData()` + `Buffer.from(arrayBuffer())`
// (whole file buffered) with no size limit at all; Planned Changes item 24 (any file type, up to
// 100MB) is the point at which that stopped being a safe combination to keep. The caller still
// gets a Buffer back afterward (read from the now-capped-size file on disk) because
// matchDocumentToTemplate needs the file's content, not just its bytes-on-the-wire.
export const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024; // 100MB

export interface ReceivedDocument {
  filename: string;
  originalName: string;
  buffer: Buffer;
  size: number;
  fields: Record<string, string>;
}

export type ReceiveDocumentResult = ReceivedDocument | { error: string; status: number };

export async function receiveDocumentUpload(request: Request, dir: string): Promise<ReceiveDocumentResult> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return { error: "Expected multipart/form-data", status: 400 };
  }
  if (!request.body) return { error: "No request body", status: 400 };

  fs.mkdirSync(dir, { recursive: true });

  type BusboyResult =
    | { filename: string; originalName: string; fields: Record<string, string>; tooLarge: boolean }
    | { error: string };

  const result = await new Promise<BusboyResult>((resolve, reject) => {
    const bb = Busboy({ headers: { "content-type": contentType }, limits: { fileSize: MAX_DOCUMENT_BYTES } });

    const fields: Record<string, string> = {};
    let filename: string | null = null;
    let originalName: string | null = null;
    let sawFile = false;
    let tooLarge = false;
    let fileWritePromise: Promise<void> | null = null;

    bb.on("file", (_fieldname, fileStream, info) => {
      sawFile = true;
      originalName = info.filename;
      filename = `${Date.now()}_${info.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const writeStream = fs.createWriteStream(path.join(dir, filename));
      fileStream.on("limit", () => {
        tooLarge = true;
      });
      fileStream.pipe(writeStream);
      fileWritePromise = new Promise<void>((res, rej) => {
        writeStream.on("finish", res);
        writeStream.on("error", rej);
        fileStream.on("error", rej);
      });
    });

    bb.on("field", (name, value) => {
      fields[name] = value;
    });

    bb.on("finish", async () => {
      try {
        if (fileWritePromise) await fileWritePromise;
        if (!sawFile || !filename || !originalName) {
          resolve({ error: "No file provided" });
          return;
        }
        resolve({ filename, originalName, fields, tooLarge });
      } catch (err) {
        reject(err);
      }
    });

    bb.on("error", reject);

    Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]).pipe(bb);
  });

  if ("error" in result) return { error: result.error, status: 400 };

  const dest = path.join(dir, result.filename);
  if (result.tooLarge) {
    fs.unlinkSync(dest);
    return { error: `File exceeds the ${MAX_DOCUMENT_BYTES / (1024 * 1024)}MB limit`, status: 413 };
  }

  const stat = fs.statSync(dest);
  if (stat.size === 0) {
    fs.unlinkSync(dest);
    return { error: "Empty file received", status: 400 };
  }

  const buffer = fs.readFileSync(dest);
  return { filename: result.filename, originalName: result.originalName, buffer, size: stat.size, fields: result.fields };
}
