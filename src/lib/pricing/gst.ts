import { brandConfig } from "@/config/brand";
import { taxSlabToPercent, type TaxSlab } from "@/lib/validation/product";

export type SupportedGstRatePercent = 0 | 5 | 12 | 18 | 28;

export interface BasketLineInput {
  productId: string;
  slug?: string;
  name?: string;
  hsnCode?: string;
  /** Tax-inclusive unit price in integer paise */
  unitPricePaise: number;
  /** Positive integer quantity */
  quantity: number;
  /** Tax slab enum ("GST_5" | "GST_12" | "GST_18") or integer percentage (5 | 12 | 18) */
  taxSlab: TaxSlab | SupportedGstRatePercent | number;
}

export interface ComputedLineTaxBreakdown {
  productId: string;
  slug?: string | undefined;
  name?: string | undefined;
  hsnCode?: string | undefined;
  unitPricePaise: number;
  quantity: number;
  /** Inclusive line total: unitPricePaise * quantity */
  lineTotalPaise: number;
  /** Pre-tax (net taxable) value in paise: Math.round((lineTotalPaise * 100) / (100 + taxRatePercent)) */
  taxableAmountPaise: number;
  /** GST slab percentage (e.g. 5, 12, 18) */
  taxRatePercent: number;
  /** Total GST extracted from lineTotalPaise: lineTotalPaise - taxableAmountPaise */
  totalTaxPaise: number;
  /** Intra-state Central GST: Math.floor(totalTaxPaise / 2) when deliveryStateCode === sellerStateCode */
  cgstPaise: number;
  /** Intra-state State GST: totalTaxPaise - cgstPaise when deliveryStateCode === sellerStateCode */
  sgstPaise: number;
  /** Inter-state Integrated GST: totalTaxPaise when deliveryStateCode !== sellerStateCode */
  igstPaise: number;
}

export interface ComputeBasketTotalsInput {
  lines: readonly BasketLineInput[];
  /** Two-letter state code of the delivery PIN code (e.g. "KA", "MH", "DL") */
  deliveryStateCode?: string | null;
  /** Two-letter state code of the seller dispatch state (defaults to brandConfig.sellerStateCode = "KA") */
  sellerStateCode?: string;
  /** Base PIN-zone shipping fee in paise from serviceable_pin_codes (defaults to 0 when no PIN selected yet) */
  pinZoneShippingFeePaise?: number;
  /** Free-shipping threshold in paise (defaults to brandConfig.freeShippingThresholdPaise = 99900 paise / Rs 999) */
  freeShippingThresholdPaise?: number;
}

export interface ComputedBasketTotals {
  lines: ComputedLineTaxBreakdown[];
  sellerStateCode: string;
  deliveryStateCode: string;
  isIntraState: boolean;
  taxSupplyType: "INTRA_STATE_CGST_SGST" | "INTER_STATE_IGST";
  /**
   * Free-shipping threshold policy:
   * Evaluated against the POST-TAX (tax-inclusive) merchandise subtotal (`subtotalPaise`)
   * so that the customer-facing "Free shipping at or above Rs 999" matches the sum of
   * displayed tax-inclusive item prices.
   */
  freeShippingThresholdBasis: "POST_TAX_INCLUSIVE_SUBTOTAL";
  freeShippingThresholdPaise: number;
  isFreeShippingApplied: boolean;
  amountRemainingForFreeShippingPaise: number;
  totalQuantity: number;
  /** Sum of line taxable amounts (pre-tax merchandise value) */
  taxableSubtotalPaise: number;
  /** Sum of line CGST amounts */
  cgstTotalPaise: number;
  /** Sum of line SGST amounts */
  sgstTotalPaise: number;
  /** Sum of line IGST amounts */
  igstTotalPaise: number;
  /** Sum of line total GST amounts (cgstTotalPaise + sgstTotalPaise + igstTotalPaise) */
  totalTaxPaise: number;
  /** Post-tax (tax-inclusive) merchandise subtotal: sum of lineTotalPaise (equals taxableSubtotalPaise + totalTaxPaise) */
  subtotalPaise: number;
  /** Applied shipping fee in paise (0 when subtotalPaise >= 99900 or basket is empty) */
  shippingPaise: number;
  /** Final payable amount in paise: subtotalPaise + shippingPaise */
  grandTotalPaise: number;
}

function normalizeRatePercent(
  slab: TaxSlab | SupportedGstRatePercent | number
): number {
  if (typeof slab === "number") {
    return Math.max(0, Math.round(slab));
  }
  return taxSlabToPercent(slab);
}

/**
 * Extracts GST and taxable value from a single tax-inclusive line item using integer paise.
 *
 * Documented Rounding Rule:
 * 1. `lineTotalPaise = unitPricePaise * quantity`
 * 2. `taxableAmountPaise = Math.round((lineTotalPaise * 100) / (100 + taxRatePercent))`
 * 3. `totalTaxPaise = lineTotalPaise - taxableAmountPaise`
 *    (Guarantees `taxableAmountPaise + totalTaxPaise === lineTotalPaise` with zero lost paise.)
 * 4. For intra-state (`isIntraState === true`):
 *    - `cgstPaise = Math.floor(totalTaxPaise / 2)`
 *    - `sgstPaise = totalTaxPaise - cgstPaise`
 *    - `igstPaise = 0`
 * 5. For inter-state (`isIntraState === false`):
 *    - `cgstPaise = 0`
 *    - `sgstPaise = 0`
 *    - `igstPaise = totalTaxPaise`
 */
export function computeLineTaxBreakdown(
  line: BasketLineInput,
  isIntraState: boolean
): ComputedLineTaxBreakdown {
  const unitPricePaise = Math.max(0, Math.round(line.unitPricePaise));
  const quantity = Math.max(0, Math.floor(line.quantity));
  const taxRatePercent = normalizeRatePercent(line.taxSlab);

  const lineTotalPaise = unitPricePaise * quantity;
  const taxableAmountPaise =
    taxRatePercent === 0
      ? lineTotalPaise
      : Math.round((lineTotalPaise * 100) / (100 + taxRatePercent));
  const totalTaxPaise = lineTotalPaise - taxableAmountPaise;

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;

  if (isIntraState) {
    cgstPaise = Math.floor(totalTaxPaise / 2);
    sgstPaise = totalTaxPaise - cgstPaise;
  } else {
    igstPaise = totalTaxPaise;
  }

  return {
    productId: line.productId,
    slug: line.slug,
    name: line.name,
    hsnCode: line.hsnCode,
    unitPricePaise,
    quantity,
    lineTotalPaise,
    taxableAmountPaise,
    taxRatePercent,
    totalTaxPaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
  };
}

/**
 * Single server-side pricing, GST extraction, CGST/SGST vs IGST split, and PIN-zone shipping calculator.
 *
 * Invoice Tax Aggregation Rule:
 * - Invoice tax is strictly the sum of per-line tax (`totalTaxPaise = sum(line.totalTaxPaise)`,
 *   `cgstTotalPaise = sum(line.cgstPaise)`, `sgstTotalPaise = sum(line.sgstPaise)`,
 *   `igstTotalPaise = sum(line.igstPaise)`, and `taxableSubtotalPaise = sum(line.taxableAmountPaise)`).
 * - Tax is never recomputed on the aggregated basket subtotal, preventing mixed-slab or rounding drift
 *   between HSN line items and the GST invoice summary.
 *
 * Free-Shipping Threshold Rule:
 * - Threshold is `Rs 999` (`99900` paise) evaluated on the **post-tax (tax-inclusive) merchandise subtotal**
 *   (`subtotalPaise`). When `subtotalPaise >= 99900`, `shippingPaise` is `0`.
 */
export function computeBasketTotals(
  input: ComputeBasketTotalsInput
): ComputedBasketTotals {
  const sellerStateCode = (
    input.sellerStateCode ?? brandConfig.sellerStateCode
  )
    .trim()
    .toUpperCase();
  const deliveryStateCode = (
    input.deliveryStateCode ?? sellerStateCode
  )
    .trim()
    .toUpperCase();

  const isIntraState = deliveryStateCode === sellerStateCode;
  const freeShippingThresholdPaise =
    input.freeShippingThresholdPaise ?? brandConfig.freeShippingThresholdPaise;
  const baseShippingPaise = Math.max(
    0,
    Math.round(input.pinZoneShippingFeePaise ?? 0)
  );

  const computedLines: ComputedLineTaxBreakdown[] = [];
  let totalQuantity = 0;
  let taxableSubtotalPaise = 0;
  let cgstTotalPaise = 0;
  let sgstTotalPaise = 0;
  let igstTotalPaise = 0;
  let totalTaxPaise = 0;
  let subtotalPaise = 0;

  for (const rawLine of input.lines) {
    if (rawLine.quantity <= 0) continue;
    const computed = computeLineTaxBreakdown(rawLine, isIntraState);
    computedLines.push(computed);

    totalQuantity += computed.quantity;
    taxableSubtotalPaise += computed.taxableAmountPaise;
    cgstTotalPaise += computed.cgstPaise;
    sgstTotalPaise += computed.sgstPaise;
    igstTotalPaise += computed.igstPaise;
    totalTaxPaise += computed.totalTaxPaise;
    subtotalPaise += computed.lineTotalPaise;
  }

  const isFreeShippingApplied =
    subtotalPaise >= freeShippingThresholdPaise && subtotalPaise > 0;
  const shippingPaise =
    subtotalPaise === 0 || isFreeShippingApplied ? 0 : baseShippingPaise;
  const amountRemainingForFreeShippingPaise =
    subtotalPaise >= freeShippingThresholdPaise
      ? 0
      : freeShippingThresholdPaise - subtotalPaise;
  const grandTotalPaise = subtotalPaise + shippingPaise;

  return {
    lines: computedLines,
    sellerStateCode,
    deliveryStateCode,
    isIntraState,
    taxSupplyType: isIntraState
      ? "INTRA_STATE_CGST_SGST"
      : "INTER_STATE_IGST",
    freeShippingThresholdBasis: "POST_TAX_INCLUSIVE_SUBTOTAL",
    freeShippingThresholdPaise,
    isFreeShippingApplied,
    amountRemainingForFreeShippingPaise,
    totalQuantity,
    taxableSubtotalPaise,
    cgstTotalPaise,
    sgstTotalPaise,
    igstTotalPaise,
    totalTaxPaise,
    subtotalPaise,
    shippingPaise,
    grandTotalPaise,
  };
}

export interface HsnSummaryRowPaise {
  hsnCode: string;
  taxSlabPercent: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalTaxPaise: number;
  grossPaise: number;
}

/**
 * Formats integer paise into Indian Rupee notation (e.g. `Rs 1,290` or `Rs 1,290.50`).
 */
export function formatPaiseToInr(paise: number): string {
  const safePaise = Math.round(paise);
  const rupees = safePaise / 100;
  const hasSubRupee = safePaise % 100 !== 0;
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: hasSubRupee ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(rupees);
  return `Rs ${formatted}`;
}

