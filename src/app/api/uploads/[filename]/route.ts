import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {
  detectImageMimeFromMagicBytes,
  extractImageDimensions,
  isSafeUploadFilename,
  MAX_IMAGE_PIXEL_DIMENSION,
} from "@/lib/storage/image-adapter";

/**
 * GET /api/uploads/[filename]
 * Safely serves sanitized product images stored outside `public/` in `.storage/uploads`.
 *
 * Security controls:
 * 1. Blocks path traversal (`..`, `/`, `\`, encoded `%2e%2e`) and non-UUID filenames.
 * 2. Verifies resolved file path remains strictly inside `.storage/uploads`.
 * 3. Re-verifies magic bytes (`JPEG`, `PNG`, `WebP` only; rejects `SVG`/`HTML`).
 * 4. Enforces maximum pixel dimensions (`4096 x 4096`).
 * 5. Serves `Content-Type` from the verified magic bytes with `X-Content-Type-Options: nosniff`
 *    and `Cache-Control: public, max-age=31536000, immutable`.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;

  if (!isSafeUploadFilename(filename)) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "X-Content-Type-Options": "nosniff" },
    });
  }

  const storageDir = path.resolve(process.cwd(), ".storage", "uploads");
  const filePath = path.resolve(
    /*turbopackIgnore: true*/ storageDir,
    path.basename(filename)
  );

  if (!filePath.startsWith(`${storageDir}${path.sep}`)) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "X-Content-Type-Options": "nosniff" },
    });
  }

  try {
    const fileBuffer = await fs.readFile(filePath);
    const sig = detectImageMimeFromMagicBytes(fileBuffer);
    if (!sig) {
      return new NextResponse("Not Found", {
        status: 404,
        headers: { "X-Content-Type-Options": "nosniff" },
      });
    }

    const dimensions = extractImageDimensions(fileBuffer, sig.mime);
    if (
      dimensions &&
      (dimensions.width <= 0 ||
        dimensions.height <= 0 ||
        dimensions.width > MAX_IMAGE_PIXEL_DIMENSION ||
        dimensions.height > MAX_IMAGE_PIXEL_DIMENSION)
    ) {
      return new NextResponse("Not Found", {
        status: 404,
        headers: { "X-Content-Type-Options": "nosniff" },
      });
    }

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": sig.mime,
        "Content-Length": String(fileBuffer.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "X-Content-Type-Options": "nosniff" },
    });
  }
}
