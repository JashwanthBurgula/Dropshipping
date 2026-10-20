export type StockStatusKind =
  | "IN_STOCK"
  | "LOW_STOCK"
  | "LIMITED_STOCK"
  | "OUT_OF_STOCK";

export type StockBadgeVariant = "inStock" | "lowStock" | "outOfStock" | "neutral";

export interface StockInput {
  supplierStock: number;
  reservedStock: number;
  bufferStock: number;
  stockLastConfirmedAt?: Date | string | null;
}

export interface ComputedStockResult {
  displayedStock: number;
  isPurchasable: boolean;
  isStaleConfirmation: boolean;
  statusKind: StockStatusKind;
  label: string;
  badgeVariant: StockBadgeVariant;
}

export interface ComputeStockOptions {
  /**
   * Maximum age (in hours) of `stockLastConfirmedAt` before a positive stock
   * reading is flagged as "Limited stock" due to stale supplier confirmation.
   * Default: 72 hours.
   */
  staleThresholdHours?: number;
  /**
   * Threshold at or below which positive stock shows "Only N left".
   * Default: 5 units.
   */
  lowStockThreshold?: number;
  /**
   * Reference timestamp for deterministic unit testing.
   */
  now?: Date;
}

/**
 * Single server-side function computing displayed stock and status label:
 *   displayedStock = max(0, supplierStock - reservedStock - bufferStock)
 *
 * Rules:
 * - If displayedStock <= 0 -> "Out of stock"
 * - If stockLastConfirmedAt is null or older than staleThresholdHours -> "Limited stock"
 * - If displayedStock <= lowStockThreshold -> "Only N left"
 * - Otherwise -> "In stock"
 */
export function computeDisplayedStock(
  input: StockInput,
  options: ComputeStockOptions = {}
): ComputedStockResult {
  const staleThresholdHours = options.staleThresholdHours ?? 72;
  const lowStockThreshold = options.lowStockThreshold ?? 5;
  const now = options.now ?? new Date();

  const rawAvailable =
    Math.floor(input.supplierStock) -
    Math.floor(input.reservedStock) -
    Math.floor(input.bufferStock);
  const displayedStock = Math.max(0, rawAvailable);

  if (displayedStock <= 0) {
    return {
      displayedStock: 0,
      isPurchasable: false,
      isStaleConfirmation: false,
      statusKind: "OUT_OF_STOCK",
      label: "Out of stock",
      badgeVariant: "outOfStock",
    };
  }

  let isStaleConfirmation = false;
  if (!input.stockLastConfirmedAt) {
    isStaleConfirmation = true;
  } else {
    const confirmedDate =
      typeof input.stockLastConfirmedAt === "string"
        ? new Date(input.stockLastConfirmedAt)
        : input.stockLastConfirmedAt;
    const ageMs = now.getTime() - confirmedDate.getTime();
    const maxAgeMs = staleThresholdHours * 60 * 60 * 1000;
    if (Number.isNaN(ageMs) || ageMs > maxAgeMs) {
      isStaleConfirmation = true;
    }
  }

  if (isStaleConfirmation) {
    return {
      displayedStock,
      isPurchasable: true,
      isStaleConfirmation: true,
      statusKind: "LIMITED_STOCK",
      label: "Limited stock",
      badgeVariant: "lowStock",
    };
  }

  if (displayedStock <= lowStockThreshold) {
    return {
      displayedStock,
      isPurchasable: true,
      isStaleConfirmation: false,
      statusKind: "LOW_STOCK",
      label: `Only ${displayedStock} left`,
      badgeVariant: "lowStock",
    };
  }

  return {
    displayedStock,
    isPurchasable: true,
    isStaleConfirmation: false,
    statusKind: "IN_STOCK",
    label: "In stock",
    badgeVariant: "inStock",
  };
}

/**
 * Formats integer paise into Indian Rupee display string (e.g. 245000 -> "₹2,450").
 */
export function formatInrFromPaise(paise: number): string {
  const rupees = Math.round(paise / 100);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}
