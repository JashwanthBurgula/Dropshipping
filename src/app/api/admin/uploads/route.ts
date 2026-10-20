import { NextResponse } from "next/server";
import { validateRequestCsrf } from "@/lib/csrf";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { getImageStorageAdapter } from "@/lib/storage/image-adapter";

/**
 * POST /api/admin/uploads
 * Accepts multipart/form-data with a `file` field, verifies magic bytes
 * (JPEG/PNG/WebP), enforces the 5 MB limit, strips EXIF/XMP/comment metadata,
 * and stores the sanitized image outside `public/`.
 */
export async function POST(request: Request) {
  const csrfValid = await validateRequestCsrf(request);
  if (!csrfValid) {
    return NextResponse.json(
      { error: "Security token expired. Reload the page and try again." },
      { status: 403 }
    );
  }

  const adminCtx = await getCurrentAdminSession();
  if (!adminCtx || adminCtx.session.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Forbidden. Verified administrator session required." },
      { status: 403 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data upload payload." },
      { status: 400 }
    );
  }

  const fileEntry = formData.get("file");
  if (!fileEntry || !(fileEntry instanceof Blob)) {
    return NextResponse.json(
      { error: "Select an image file (JPEG, PNG, or WebP) to upload." },
      { status: 400 }
    );
  }

  const rawAspect = formData.get("aspectRatio");
  const aspectRatio: "1:1" | "4:5" = rawAspect === "1:1" ? "1:1" : "4:5";

  try {
    const arrayBuf = await fileEntry.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const adapter = getImageStorageAdapter();
    const stored = await adapter.storeSanitizedImage({
      buffer,
      aspectRatio,
    });

    return NextResponse.json(
      {
        ok: true,
        image: {
          ...stored,
          aspectRatio,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to process image upload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
