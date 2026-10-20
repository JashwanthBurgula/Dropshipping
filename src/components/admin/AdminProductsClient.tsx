"use client";

import * as React from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Edit3,
  Archive,
  RotateCcw,
  Upload,
  Trash2,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { CSRF_HEADER_NAME } from "@/lib/csrf";
import { formatInrFromPaise } from "@/lib/catalogue/stock";
import { brandConfig } from "@/config/brand";
import type { AdminProductRecord } from "@/lib/catalogue/service";
import type { SeedSupplierItem } from "@/lib/data/seed-products";
import type { TaxSlab } from "@/lib/validation/product";

export interface AdminProductsClientProps {
  initialProducts: AdminProductRecord[];
  suppliers: SeedSupplierItem[];
}

interface ImageSlotDraft {
  url: string;
  altText: string;
  aspectRatio: "1:1" | "4:5";
}

interface ProductFormState {
  name: string;
  shortDescription: string;
  description: string;
  category: string;
  tagsInput: string;
  material: string;
  dimensions: string;
  careInstructions: string;
  priceRupees: string;
  compareAtRupees: string;
  taxSlab: TaxSlab;
  hsnCode: string;
  supplierId: string;
  supplierSku: string;
  supplierProductUrl: string;
  supplierStock: string;
  bufferStock: string;
  dispatchTimeDays: string;
  images: ImageSlotDraft[];
}

const DEFAULT_FORM_STATE: ProductFormState = {
  name: "",
  shortDescription: "",
  description: "",
  category: brandConfig.categories[0].name,
  tagsInput: "stoneware, handcrafted",
  material: "",
  dimensions: "",
  careInstructions: "",
  priceRupees: "1850",
  compareAtRupees: "",
  taxSlab: "GST_12",
  hsnCode: "69120010",
  supplierId: "sup-bhadravati-kiln",
  supplierSku: "",
  supplierProductUrl: "",
  supplierStock: "20",
  bufferStock: "2",
  dispatchTimeDays: "2",
  images: [
    {
      url: "/placeholder/new-product-slot-1",
      altText: "Primary product studio view",
      aspectRatio: "4:5",
    },
  ],
};

export function AdminProductsClient({
  initialProducts,
  suppliers,
}: AdminProductsClientProps) {
  const [csrfToken, setCsrfToken] = React.useState("");
  const [products, setProducts] =
    React.useState<AdminProductRecord[]>(initialProducts);

  const [searchQuery, setSearchQuery] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | "active" | "archived"
  >("all");

  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingProductId, setEditingProductId] = React.useState<string | null>(
    null
  );
  const [form, setForm] = React.useState<ProductFormState>(DEFAULT_FORM_STATE);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {}
  );
  const [formBannerError, setFormBannerError] = React.useState("");
  const [statusNotice, setStatusNotice] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [isUploadingImage, setIsUploadingImage] = React.useState(false);

  React.useEffect(() => {
    void fetch("/api/auth/csrf")
      .then((res) => res.json())
      .then((data: { csrfToken?: string }) => {
        if (data.csrfToken) setCsrfToken(data.csrfToken);
      })
      .catch(() => undefined);
  }, []);

  const filteredProducts = React.useMemo(() => {
    return products.filter((item) => {
      if (statusFilter === "active" && !item.isActive) return false;
      if (statusFilter === "archived" && item.isActive) return false;
      if (
        categoryFilter &&
        item.category.toLowerCase() !== categoryFilter.toLowerCase()
      ) {
        return false;
      }
      if (searchQuery.trim() !== "") {
        const q = searchQuery.trim().toLowerCase();
        const matches =
          item.name.toLowerCase().includes(q) ||
          item.slug.toLowerCase().includes(q) ||
          item.supplierSku.toLowerCase().includes(q) ||
          item.hsnCode.toLowerCase().includes(q) ||
          item.supplierName.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [products, statusFilter, categoryFilter, searchQuery]);

  const openCreateModal = () => {
    setEditingProductId(null);
    setFieldErrors({});
    setFormBannerError("");
    setForm({
      ...DEFAULT_FORM_STATE,
      supplierId: suppliers[0]?.id ?? "sup-bhadravati-kiln",
    });
    setModalOpen(true);
  };

  const openEditModal = (product: AdminProductRecord) => {
    setEditingProductId(product.id);
    setFieldErrors({});
    setFormBannerError("");
    setForm({
      name: product.name,
      shortDescription: product.shortDescription,
      description: product.description,
      category: product.category,
      tagsInput: product.tags.join(", "),
      material: product.material,
      dimensions: product.dimensions,
      careInstructions: product.careInstructions ?? "",
      priceRupees: String(Math.round(product.pricePaise / 100)),
      compareAtRupees: product.compareAtPaise
        ? String(Math.round(product.compareAtPaise / 100))
        : "",
      taxSlab: product.taxSlab,
      hsnCode: product.hsnCode,
      supplierId: product.supplierId,
      supplierSku: product.supplierSku,
      supplierProductUrl: product.supplierProductUrl ?? "",
      supplierStock: String(product.supplierStock),
      bufferStock: String(product.bufferStock),
      dispatchTimeDays: String(product.dispatchTimeDays),
      images:
        product.images.length > 0
          ? product.images.map((img) => ({
              url: img.url,
              altText: img.altText,
              aspectRatio: img.aspectRatio,
            }))
          : [
              {
                url: `/placeholder/${product.slug}-1`,
                altText: product.name,
                aspectRatio: "4:5",
              },
            ],
    });
    setModalOpen(true);
  };

  const handleImageFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    aspectRatio: "1:1" | "4:5"
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFormBannerError("");
    setIsUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("aspectRatio", aspectRatio);

      const res = await fetch("/api/admin/uploads", {
        method: "POST",
        headers: {
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: formData,
      });

      const data = (await res.json()) as {
        ok?: boolean;
        image?: { url: string; aspectRatio: "1:1" | "4:5" };
        error?: string;
      };

      if (!res.ok || !data.ok || !data.image) {
        setFormBannerError(
          data.error ?? "Image upload failed magic-byte or size verification."
        );
        return;
      }

      setForm((prev) => ({
        ...prev,
        images: [
          ...prev.images,
          {
            url: data.image!.url,
            altText: `${prev.name || "Product"} studio photograph`,
            aspectRatio: data.image!.aspectRatio,
          },
        ],
      }));
    } catch {
      setFormBannerError("Network error while uploading image.");
    } finally {
      setIsUploadingImage(false);
      event.target.value = "";
    }
  };

  const handleSaveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFormBannerError("");
    setIsSaving(true);

    const pricePaise = Math.round(Number(form.priceRupees || "0") * 100);
    const compareAtPaise =
      form.compareAtRupees.trim() !== ""
        ? Math.round(Number(form.compareAtRupees) * 100)
        : null;

    const payload = {
      name: form.name,
      shortDescription: form.shortDescription,
      description: form.description,
      category: form.category,
      tags: form.tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      material: form.material,
      dimensions: form.dimensions,
      careInstructions: form.careInstructions || null,
      pricePaise,
      compareAtPaise,
      taxSlab: form.taxSlab,
      hsnCode: form.hsnCode,
      supplierId: form.supplierId,
      supplierSku: form.supplierSku,
      supplierProductUrl: form.supplierProductUrl || "",
      supplierStock: Number(form.supplierStock || "0"),
      bufferStock: Number(form.bufferStock || "0"),
      dispatchTimeDays: Number(form.dispatchTimeDays || "2"),
      images: form.images.map((img, idx) => ({
        url: img.url,
        altText: img.altText,
        aspectRatio: img.aspectRatio,
        sortOrder: idx,
      })),
    };

    try {
      const endpoint = editingProductId
        ? `/api/admin/products/${editingProductId}`
        : "/api/admin/products";
      const method = editingProductId ? "PUT" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        product?: AdminProductRecord;
        error?: string;
        fieldErrors?: Record<string, string>;
      };

      if (!res.ok || !data.ok || !data.product) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        setFormBannerError(
          data.error ?? "Please correct the highlighted fields."
        );
        setIsSaving(false);
        return;
      }

      const saved = data.product;
      setProducts((prev) => {
        if (editingProductId) {
          return prev.map((p) => (p.id === saved.id ? saved : p));
        }
        return [saved, ...prev];
      });

      setModalOpen(false);
      setStatusNotice(
        editingProductId
          ? `Updated "${saved.name}" and recorded AuditLog entry.`
          : `Created "${saved.name}" and recorded AuditLog entry.`
      );
    } catch {
      setFormBannerError("Network error while saving product.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActiveState = async (
    product: AdminProductRecord,
    nextActive: boolean
  ) => {
    setStatusNotice("");
    try {
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify({ isActive: nextActive }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        product?: AdminProductRecord;
        error?: string;
      };

      if (res.ok && data.ok && data.product) {
        const updated = data.product;
        setProducts((prev) =>
          prev.map((p) => (p.id === updated.id ? updated : p))
        );
        setStatusNotice(
          nextActive
            ? `Restored "${updated.name}" to the active storefront catalogue.`
            : `Soft-deleted "${updated.name}" (is_active = false). Past orders retain their product reference.`
        );
      }
    } catch {
      // Ignore network hiccup
    }
  };

  return (
    <div className="mt-6 flex flex-col gap-5">
      {statusNotice ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-control border border-moss/40 bg-white px-4 py-3 text-xs font-medium text-[#18181B]"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2
              className="h-4 w-4 text-moss"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span>{statusNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusNotice("")}
            className="text-xs text-[#52525B] underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Dense Filter & Action Bar */}
      <div className="flex flex-col justify-between gap-3 rounded-card border border-[#E4E4E7] bg-white p-4 lg:flex-row lg:items-end">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label
              htmlFor="admin-product-search"
              className="block text-xs font-semibold text-[#52525B]"
            >
              Search SKU, Name, HSN, or Supplier
            </label>
            <div className="relative mt-1">
              <Search
                className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-[#52525B]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <input
                id="admin-product-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. BKC-PL-27 or 69120010..."
                className="min-h-[38px] w-full rounded-control border border-[#E4E4E7] bg-[#F4F4F5] pr-3 pl-8 text-xs text-[#18181B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="admin-category-filter"
              className="block text-xs font-semibold text-[#52525B]"
            >
              Category
            </label>
            <select
              id="admin-category-filter"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="mt-1 min-h-[38px] w-full rounded-control border border-[#E4E4E7] bg-[#F4F4F5] px-2.5 text-xs text-[#18181B]"
            >
              <option value="">All 4 Categories</option>
              {brandConfig.categories.map((cat) => (
                <option key={cat.slug} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="admin-status-filter"
              className="block text-xs font-semibold text-[#52525B]"
            >
              Catalogue Status
            </label>
            <select
              id="admin-status-filter"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as "all" | "active" | "archived"
                )
              }
              className="mt-1 min-h-[38px] w-full rounded-control border border-[#E4E4E7] bg-[#F4F4F5] px-2.5 text-xs text-[#18181B]"
            >
              <option value="all">All ({products.length})</option>
              <option value="active">
                Active Only ({products.filter((p) => p.isActive).length})
              </option>
              <option value="archived">
                Soft-Deleted / Archived (
                {products.filter((p) => !p.isActive).length})
              </option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={openCreateModal}
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <span>Add Product</span>
          </Button>
        </div>
      </div>

      {/* Dense Admin Product Table */}
      <div className="overflow-hidden rounded-card border border-[#E4E4E7] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#E4E4E7] bg-[#F4F4F5] text-[#52525B]">
                <th className="px-3.5 py-2.5 font-semibold">Product / Slug</th>
                <th className="px-3.5 py-2.5 font-semibold">
                  Supplier &amp; SKU
                </th>
                <th className="px-3.5 py-2.5 font-semibold">GST &amp; HSN</th>
                <th className="px-3.5 py-2.5 text-right font-semibold">
                  Price (INR)
                </th>
                <th className="px-3.5 py-2.5 text-right font-semibold">
                  Stock (Sup / Res / Buf = Disp)
                </th>
                <th className="px-3.5 py-2.5 font-semibold">Status Chips</th>
                <th className="px-3.5 py-2.5 text-right font-semibold">
                  Actions (Soft Delete / Restore)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E4E7]">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-[#52525B]"
                  >
                    No products match the current search or status filter.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    className={
                      product.isActive
                        ? "hover:bg-[#F4F4F5]/60"
                        : "bg-[#F4F4F5]/80 text-[#52525B]"
                    }
                  >
                    <td className="px-3.5 py-3">
                      <div className="font-medium text-[#18181B]">
                        {product.name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-[#52525B]">
                        <span>{product.category}</span>
                        <span>·</span>
                        {product.isActive ? (
                          <Link
                            href={`/catalogue/${product.slug}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 text-clay hover:underline"
                          >
                            <span>/{product.slug}</span>
                            <ExternalLink
                              className="h-3 w-3"
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                          </Link>
                        ) : (
                          <span>/{product.slug} (Hidden from storefront)</span>
                        )}
                      </div>
                    </td>

                    <td className="px-3.5 py-3">
                      <div className="font-medium text-[#18181B]">
                        {product.supplierName}
                      </div>
                      <div className="font-mono text-[11px] text-[#52525B]">
                        SKU: {product.supplierSku} · Prep:{" "}
                        {product.dispatchTimeDays}d
                      </div>
                    </td>

                    <td className="px-3.5 py-3 font-mono text-[11px]">
                      <div className="font-semibold text-[#18181B]">
                        {product.taxSlab.replace("GST_", "")}% GST
                      </div>
                      <div className="text-[#52525B]">HSN {product.hsnCode}</div>
                    </td>

                    <td className="px-3.5 py-3 text-right font-mono font-semibold text-[#18181B] tabular-nums">
                      {formatInrFromPaise(product.pricePaise)}
                    </td>

                    <td className="px-3.5 py-3 text-right font-mono text-[11px] tabular-nums">
                      <div>
                        {product.supplierStock} - {product.reservedStock} -{" "}
                        {product.bufferStock} ={" "}
                        <span className="font-bold text-[#18181B]">
                          {product.stock.displayedStock}
                        </span>
                      </div>
                    </td>

                    <td className="px-3.5 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {product.isActive ? (
                          <Badge variant="inStock">Active</Badge>
                        ) : (
                          <Badge variant="neutral">Soft-Deleted</Badge>
                        )}
                        <Badge variant={product.stock.badgeVariant}>
                          {product.stock.label}
                        </Badge>
                      </div>
                    </td>

                    <td className="px-3.5 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => openEditModal(product)}
                        >
                          <Edit3
                            className="h-3.5 w-3.5"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          <span>Edit</span>
                        </Button>

                        {product.isActive ? (
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() =>
                              handleToggleActiveState(product, false)
                            }
                          >
                            <Archive
                              className="h-3.5 w-3.5"
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                            <span>Soft Delete</span>
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              handleToggleActiveState(product, true)
                            }
                          >
                            <RotateCcw
                              className="h-3.5 w-3.5"
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                            <span>Restore</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editingProductId
            ? "Edit Catalogue Product"
            : "Add New Catalogue Product"
        }
        maxWidthClass="max-w-3xl"
      >
        <form
          onSubmit={handleSaveProduct}
          noValidate
          className="max-h-[75vh] overflow-y-auto pr-1"
        >
          {formBannerError ? (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-control border border-brick bg-brick/5 p-3 text-xs font-medium text-brick"
            >
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span>{formBannerError}</span>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input
                id="prod-name"
                name="name"
                label="Product name"
                required
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
                error={fieldErrors.name}
              />
            </div>

            <div>
              <label
                htmlFor="prod-category"
                className="block text-sm font-medium text-ink"
              >
                Category
              </label>
              <select
                id="prod-category"
                value={form.category}
                onChange={(e) =>
                  setForm((p) => ({ ...p, category: e.target.value }))
                }
                className="mt-1.5 min-h-[42px] w-full rounded-control border border-stone bg-paper px-3 text-sm text-ink"
              >
                {brandConfig.categories.map((c) => (
                  <option key={c.slug} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <Input
              id="prod-tags"
              name="tags"
              label="Tags (comma-separated)"
              value={form.tagsInput}
              onChange={(e) =>
                setForm((p) => ({ ...p, tagsInput: e.target.value }))
              }
              error={fieldErrors.tags}
            />

            <div className="sm:col-span-2">
              <Input
                id="prod-short-desc"
                name="shortDescription"
                label="Short summary (displayed on catalogue cards)"
                required
                value={form.shortDescription}
                onChange={(e) =>
                  setForm((p) => ({ ...p, shortDescription: e.target.value }))
                }
                error={fieldErrors.shortDescription}
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="prod-full-desc"
                className="block text-sm font-medium text-ink"
              >
                Full studio description
              </label>
              <textarea
                id="prod-full-desc"
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
                className="mt-1.5 w-full rounded-control border border-stone bg-paper p-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
              />
              {fieldErrors.description ? (
                <p className="mt-1 text-xs text-brick">
                  {fieldErrors.description}
                </p>
              ) : null}
            </div>

            <Input
              id="prod-material"
              name="material"
              label="Material & finish"
              required
              value={form.material}
              onChange={(e) =>
                setForm((p) => ({ ...p, material: e.target.value }))
              }
              error={fieldErrors.material}
            />

            <Input
              id="prod-dimensions"
              name="dimensions"
              label="Dimensions & weight/capacity"
              required
              value={form.dimensions}
              onChange={(e) =>
                setForm((p) => ({ ...p, dimensions: e.target.value }))
              }
              error={fieldErrors.dimensions}
            />

            <div className="sm:col-span-2">
              <Input
                id="prod-care"
                name="careInstructions"
                label="Care instructions"
                value={form.careInstructions}
                onChange={(e) =>
                  setForm((p) => ({ ...p, careInstructions: e.target.value }))
                }
              />
            </div>

            <Input
              id="prod-price-rupees"
              name="priceRupees"
              type="number"
              label="Selling price (INR, GST-inclusive)"
              required
              value={form.priceRupees}
              onChange={(e) =>
                setForm((p) => ({ ...p, priceRupees: e.target.value }))
              }
              error={fieldErrors.pricePaise}
            />

            <Input
              id="prod-compare-rupees"
              name="compareAtRupees"
              type="number"
              label="Compare-at price (INR, optional)"
              value={form.compareAtRupees}
              onChange={(e) =>
                setForm((p) => ({ ...p, compareAtRupees: e.target.value }))
              }
            />

            <div>
              <label
                htmlFor="prod-tax-slab"
                className="block text-sm font-medium text-ink"
              >
                GST Tax Slab
              </label>
              <select
                id="prod-tax-slab"
                value={form.taxSlab}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    taxSlab: e.target.value as TaxSlab,
                  }))
                }
                className="mt-1.5 min-h-[42px] w-full rounded-control border border-stone bg-paper px-3 text-sm text-ink"
              >
                <option value="GST_5">5% GST (Handloom / Terracotta)</option>
                <option value="GST_12">12% GST (Stoneware / Brassware)</option>
                <option value="GST_18">18% GST (Lighting / Hardware)</option>
                <option value="GST_28">28% GST</option>
                <option value="GST_0">0% GST (Exempt)</option>
              </select>
            </div>

            <Input
              id="prod-hsn"
              name="hsnCode"
              label="GST HSN Code (4 to 8 digits)"
              required
              value={form.hsnCode}
              onChange={(e) =>
                setForm((p) => ({ ...p, hsnCode: e.target.value }))
              }
              error={fieldErrors.hsnCode}
            />

            <div>
              <label
                htmlFor="prod-supplier"
                className="block text-sm font-medium text-ink"
              >
                Partner Supplier / Workshop
              </label>
              <select
                id="prod-supplier"
                value={form.supplierId}
                onChange={(e) =>
                  setForm((p) => ({ ...p, supplierId: e.target.value }))
                }
                className="mt-1.5 min-h-[42px] w-full rounded-control border border-stone bg-paper px-3 text-sm text-ink"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.city})
                  </option>
                ))}
              </select>
            </div>

            <Input
              id="prod-supplier-sku"
              name="supplierSku"
              label="Supplier SKU"
              required
              value={form.supplierSku}
              onChange={(e) =>
                setForm((p) => ({ ...p, supplierSku: e.target.value }))
              }
              error={fieldErrors.supplierSku}
            />

            <div className="sm:col-span-2">
              <Input
                id="prod-supplier-url"
                name="supplierProductUrl"
                label="Supplier catalogue URL (optional)"
                placeholder="https://workshop.example.in/item"
                value={form.supplierProductUrl}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    supplierProductUrl: e.target.value,
                  }))
                }
                error={fieldErrors.supplierProductUrl}
              />
            </div>

            <Input
              id="prod-supplier-stock"
              name="supplierStock"
              type="number"
              label="Supplier Stock"
              required
              value={form.supplierStock}
              onChange={(e) =>
                setForm((p) => ({ ...p, supplierStock: e.target.value }))
              }
              error={fieldErrors.supplierStock}
            />

            <div className="grid grid-cols-2 gap-2.5">
              <Input
                id="prod-buffer-stock"
                name="bufferStock"
                type="number"
                label="Safety Buffer"
                required
                value={form.bufferStock}
                onChange={(e) =>
                  setForm((p) => ({ ...p, bufferStock: e.target.value }))
                }
                error={fieldErrors.bufferStock}
              />
              <Input
                id="prod-dispatch-days"
                name="dispatchTimeDays"
                type="number"
                label="Prep Days"
                required
                value={form.dispatchTimeDays}
                onChange={(e) =>
                  setForm((p) => ({ ...p, dispatchTimeDays: e.target.value }))
                }
                error={fieldErrors.dispatchTimeDays}
              />
            </div>

            {/* Multiple Image Slots & Sanitized Upload */}
            <div className=" border-t border-stone pt-4 sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-ink">
                    Product Image Slots ({form.images.length})
                  </p>
                  <p className="text-xs text-ink-muted">
                    Uploads are magic-byte verified (JPEG/PNG/WebP, max 5 MB),
                    stripped of EXIF metadata, and saved outside public/.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-control border border-stone bg-sand px-3 py-1.5 text-xs font-medium text-ink hover:bg-stone/50">
                    <Upload
                      className="h-3.5 w-3.5"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <span>
                      {isUploadingImage
                        ? "Sanitizing..."
                        : "Upload Photo (4:5)"}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      disabled={isUploadingImage}
                      onChange={(e) => void handleImageFileUpload(e, "4:5")}
                    />
                  </label>

                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        images: [
                          ...prev.images,
                          {
                            url: `/placeholder/slot-${prev.images.length + 1}`,
                            altText: `${prev.name || "Product"} view ${
                              prev.images.length + 1
                            }`,
                            aspectRatio: "1:1",
                          },
                        ],
                      }))
                    }
                  >
                    + Add 1:1 Image
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2.5">
                {form.images.map((img, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 gap-2 rounded-control border border-stone bg-sand/60 p-2.5 sm:grid-cols-12 sm:items-center"
                  >
                    <div className="sm:col-span-5">
                      <input
                        type="text"
                        aria-label={`Image ${idx + 1} URL`}
                        value={img.url}
                        onChange={(e) => {
                          const val = e.target.value;
                          setForm((prev) => ({
                            ...prev,
                            images: prev.images.map((item, i) =>
                              i === idx ? { ...item, url: val } : item
                            ),
                          }));
                        }}
                        className="min-h-[36px] w-full rounded-control border border-stone bg-paper px-2.5 font-mono text-xs text-ink"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        aria-label={`Image ${idx + 1} alt text`}
                        value={img.altText}
                        onChange={(e) => {
                          const val = e.target.value;
                          setForm((prev) => ({
                            ...prev,
                            images: prev.images.map((item, i) =>
                              i === idx ? { ...item, altText: val } : item
                            ),
                          }));
                        }}
                        placeholder="Descriptive alt text"
                        className="min-h-[36px] w-full rounded-control border border-stone bg-paper px-2.5 text-xs text-ink"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <select
                        aria-label={`Image ${idx + 1} aspect ratio`}
                        value={img.aspectRatio}
                        onChange={(e) => {
                          const val = e.target.value as "1:1" | "4:5";
                          setForm((prev) => ({
                            ...prev,
                            images: prev.images.map((item, i) =>
                              i === idx ? { ...item, aspectRatio: val } : item
                            ),
                          }));
                        }}
                        className="min-h-[36px] w-full rounded-control border border-stone bg-paper px-2 text-xs text-ink"
                      >
                        <option value="4:5">4:5 Portrait</option>
                        <option value="1:1">1:1 Square</option>
                      </select>
                    </div>
                    <div className="text-right sm:col-span-1">
                      {form.images.length > 1 ? (
                        <button
                          type="button"
                          aria-label={`Remove image slot ${idx + 1}`}
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              images: prev.images.filter((_, i) => i !== idx),
                            }))
                          }
                          className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-control text-brick hover:bg-brick/10"
                        >
                          <Trash2
                            className="h-4 w-4"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-stone pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSaving}
              loadingText="Saving product..."
            >
              {editingProductId ? "Save Changes" : "Create Product"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
