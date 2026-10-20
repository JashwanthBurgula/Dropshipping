import { NextResponse } from "next/server";
import { z } from "zod";
import { validateRequestCsrf } from "@/lib/csrf";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { adminProductInputSchema } from "@/lib/validation/product";
import {
  setAdminProductActiveState,
  updateAdminProduct,
} from "@/lib/catalogue/service";

const activeToggleSchema = z.object({
  isActive: z.boolean(),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = adminProductInputSchema.safeParse(body);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return NextResponse.json(
      {
        error: "Please fix the highlighted product fields before saving.",
        fieldErrors,
      },
      { status: 400 }
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

  const updated = await updateAdminProduct(
    id,
    parsed.data,
    adminCtx.session.userId,
    ip
  );

  if (!updated) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, product: updated }, { status: 200 });
}

/**
 * PATCH /api/admin/products/[id]
 * Soft-deletes (`isActive: false`) or restores (`isActive: true`) a product
 * and writes a before/after AuditLog entry.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = activeToggleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Specify boolean `isActive` to archive or restore the product." },
      { status: 400 }
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

  const updated = await setAdminProductActiveState(
    id,
    parsed.data.isActive,
    adminCtx.session.userId,
    ip
  );

  if (!updated) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, product: updated }, { status: 200 });
}

/**
 * DELETE /api/admin/products/[id]
 * Enforces soft delete only (`isActive = false`) so past orders always keep their product reference.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

  const archived = await setAdminProductActiveState(
    id,
    false,
    adminCtx.session.userId,
    ip
  );

  if (!archived) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, product: archived }, { status: 200 });
}
