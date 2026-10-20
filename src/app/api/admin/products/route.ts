import { NextResponse } from "next/server";
import { validateRequestCsrf } from "@/lib/csrf";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { adminProductInputSchema } from "@/lib/validation/product";
import {
  createAdminProduct,
  listAdminProducts,
  listSuppliersForAdmin,
} from "@/lib/catalogue/service";

export async function GET(request: Request) {
  const adminCtx = await getCurrentAdminSession();
  if (!adminCtx || adminCtx.session.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Forbidden. Verified administrator session required." },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const rawStatus = url.searchParams.get("status");
  const status: "all" | "active" | "archived" =
    rawStatus === "active" || rawStatus === "archived" ? rawStatus : "all";

  const [products, suppliers] = await Promise.all([
    listAdminProducts({ search, category, status }),
    listSuppliersForAdmin(),
  ]);

  return NextResponse.json(
    {
      ok: true,
      products,
      suppliers,
    },
    { status: 200 }
  );
}

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

  const created = await createAdminProduct(
    parsed.data,
    adminCtx.session.userId,
    ip
  );

  return NextResponse.json(
    {
      ok: true,
      product: created,
    },
    { status: 201 }
  );
}
