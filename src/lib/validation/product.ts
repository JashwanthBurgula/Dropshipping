import { z } from "zod";

export const TAX_SLAB_VALUES = [
  "GST_0",
  "GST_5",
  "GST_12",
  "GST_18",
  "GST_28",
] as const;

export type TaxSlab = (typeof TAX_SLAB_VALUES)[number];

export function taxSlabToPercent(slab: TaxSlab): number {
  switch (slab) {
    case "GST_0":
      return 0;
    case "GST_5":
      return 5;
    case "GST_12":
      return 12;
    case "GST_18":
      return 18;
    case "GST_28":
      return 28;
  }
}

export function percentToTaxSlab(percent: number): TaxSlab {
  switch (percent) {
    case 0:
      return "GST_0";
    case 5:
      return "GST_5";
    case 12:
      return "GST_12";
    case 18:
      return "GST_18";
    case 28:
      return "GST_28";
    default:
      return "GST_12";
  }
}

export const CATALOGUE_SORT_VALUES = [
  "newest",
  "price_asc",
  "price_desc",
] as const;

export type CatalogueSortOption = (typeof CATALOGUE_SORT_VALUES)[number];

export const PRODUCT_CATEGORIES = [
  "Tableware & Ceramics",
  "Linen & Textiles",
  "Brass & Metalwork",
  "Lighting & Glass",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const catalogueFilterSchema = z.object({
  category: z.string().trim().optional(),
  minPrice: z
    .preprocess(
      (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
      z.number().min(0).max(500000).optional()
    )
    .optional(),
  maxPrice: z
    .preprocess(
      (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
      z.number().min(0).max(500000).optional()
    )
    .optional(),
  sort: z.enum(CATALOGUE_SORT_VALUES).default("newest"),
  page: z
    .preprocess(
      (v) => (v === "" || v === undefined || v === null ? 1 : Number(v)),
      z.number().int().min(1).default(1)
    )
    .default(1),
  pageSize: z
    .preprocess(
      (v) => (v === "" || v === undefined || v === null ? 12 : Number(v)),
      z.number().int().min(1).max(48).default(12)
    )
    .default(12),
});

export type CatalogueFilterInput = z.infer<typeof catalogueFilterSchema>;

export const productImageInputSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "Provide an image path or uploaded storage URL."),
  altText: z
    .string()
    .trim()
    .min(3, "Provide descriptive alt text for screen readers (at least 3 characters).")
    .max(180, "Alt text must be under 180 characters."),
  aspectRatio: z.enum(["1:1", "4:5"]).default("4:5"),
  sortOrder: z.number().int().min(0).default(0),
});

export const adminProductInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Product name must be at least 3 characters.")
    .max(140, "Product name must be 140 characters or fewer."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must use lowercase letters, numbers, and hyphens only."
    )
    .optional(),
  shortDescription: z
    .string()
    .trim()
    .min(10, "Short description must be at least 10 characters.")
    .max(280, "Short description must be 280 characters or fewer."),
  description: z
    .string()
    .trim()
    .min(20, "Detailed description must be at least 20 characters.")
    .max(4000, "Detailed description must be 4000 characters or fewer."),
  category: z
    .string()
    .trim()
    .min(2, "Select a product category."),
  tags: z
    .array(z.string().trim().min(1).max(40))
    .max(12, "Maximum 12 tags per product.")
    .default([]),
  material: z
    .string()
    .trim()
    .min(2, "Specify the primary material and finish.")
    .max(200, "Material specification must be under 200 characters."),
  dimensions: z
    .string()
    .trim()
    .min(2, "Specify product dimensions and weight/capacity.")
    .max(200, "Dimensions must be under 200 characters."),
  careInstructions: z
    .string()
    .trim()
    .max(500, "Care instructions must be under 500 characters.")
    .optional()
    .nullable(),
  pricePaise: z
    .number()
    .int("Price in paise must be an integer.")
    .min(1000, "Minimum product price is ₹10 (1000 paise).")
    .max(50000000, "Maximum product price exceeded."),
  compareAtPaise: z
    .number()
    .int()
    .min(1000)
    .optional()
    .nullable(),
  taxSlab: z.enum(TAX_SLAB_VALUES),
  hsnCode: z
    .string()
    .trim()
    .regex(
      /^\d{4,8}$/,
      "Enter a valid 4 to 8 digit GST HSN code (for example, 69120010)."
    ),
  supplierId: z
    .string()
    .trim()
    .min(2, "Select an active supplier workshop."),
  supplierSku: z
    .string()
    .trim()
    .min(2, "Enter the supplier SKU reference.")
    .max(80, "Supplier SKU must be 80 characters or fewer."),
  supplierProductUrl: z
    .string()
    .trim()
    .url("Enter a valid supplier product URL starting with https:// or http://.")
    .optional()
    .nullable()
    .or(z.literal("")),
  supplierStock: z
    .number()
    .int()
    .min(0, "Supplier stock cannot be negative.")
    .max(100000),
  bufferStock: z
    .number()
    .int()
    .min(0, "Safety buffer stock cannot be negative.")
    .max(10000)
    .default(2),
  dispatchTimeDays: z
    .number()
    .int()
    .min(1, "Processing time must be at least 1 business day.")
    .max(21, "Processing time cannot exceed 21 business days.")
    .default(2),
  images: z
    .array(productImageInputSchema)
    .min(1, "Add at least one product image slot."),
});

export type AdminProductInput = z.infer<typeof adminProductInputSchema>;

export function slugifyProductName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
