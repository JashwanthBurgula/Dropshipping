import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import {
  getProductRecordByIdIncludingInactive,
  type StorefrontProductImage,
} from "@/lib/catalogue/service";
import { formatInrFromPaise } from "@/lib/catalogue/stock";
import {
  computeBasketTotals,
  type ComputedBasketTotals,
  type ComputedLineTaxBreakdown,
} from "@/lib/pricing/gst";
import {
  estimateDelivery,
  type DeliveryEstimateResult,
} from "@/lib/orders/estimate-delivery";
import { lookupServiceablePinCode } from "@/lib/auth/service";
import { brandConfig } from "@/config/brand";
import type { TaxSlab } from "@/lib/validation/product";

export const MAX_QTY_PER_LINE = 10;

export type CartWarningCode =
  | "ITEM_DEACTIVATED"
  | "ITEM_OUT_OF_STOCK"
  | "QUANTITY_REDUCED_BY_STOCK"
  | "PRICE_CHANGED";

export interface CartWarning {
  code: CartWarningCode;
  productId: string;
  productName: string;
  previousPricePaise?: number;
  currentPricePaise?: number;
  desiredQuantity?: number;
  availableQuantity?: number;
  message: string;
}

export interface CartLineView {
  itemId: string;
  productId: string;
  slug: string;
  name: string;
  category: string;
  hsnCode: string;
  taxSlab: TaxSlab;
  primaryImage: StorefrontProductImage | null;
  isActive: boolean;
  isPurchasable: boolean;
  displayedStock: number;
  maxAllowedQuantity: number;
  stockLabel: string;
  desiredQuantity: number;
  effectiveQuantity: number;
  snapshotPricePaise: number;
  currentUnitPricePaise: number;
  priceChanged: boolean;
  taxBreakdown: ComputedLineTaxBreakdown;
  warnings: CartWarning[];
}

export interface CustomerCartView {
  userId: string;
  pinCode: string | null;
  pinServiceability: {
    pinCode: string;
    city: string;
    state: string;
    stateCode: string;
    zoneCode: string;
    transitDays: number;
    baseShippingFeePaise: number;
    codAvailable: boolean;
  } | null;
  deliveryEstimate: DeliveryEstimateResult | null;
  lines: CartLineView[];
  warnings: CartWarning[];
  hasBlockingIssues: boolean;
  totals: ComputedBasketTotals;
  updatedAt: string;
}

interface StoredCartItemRecord {
  id: string;
  productId: string;
  quantity: number;
  desiredQuantity: number;
  snapshotPricePaise: number;
  updatedAt: string;
}

interface StoredCustomerCart {
  id: string;
  userId: string;
  pinCode: string | null;
  items: Map<string, StoredCartItemRecord>;
  updatedAt: string;
}

const inMemoryCarts = new Map<string, StoredCustomerCart>();

export async function resetInMemoryCartsForTests(): Promise<void> {
  inMemoryCarts.clear();
  if (process.env.DATABASE_URL) {
    try {
      await prisma.cartItem.deleteMany({});
      await prisma.cart.deleteMany({});
    } catch {
      // Ignore if DB not connected
    }
  }
}

async function getOrCreateStoredCart(
  userId: string,
  defaultPinCode?: string | null
): Promise<StoredCustomerCart> {
  let memCart = inMemoryCarts.get(userId);
  if (!memCart) {
    memCart = {
      id: crypto.randomUUID(),
      userId,
      pinCode: defaultPinCode ?? "560038",
      items: new Map(),
      updatedAt: new Date().toISOString(),
    };
    inMemoryCarts.set(userId, memCart);
  }

  if (process.env.DATABASE_URL) {
    try {
      const dbCart = await prisma.cart.findUnique({
        where: { userId },
        include: { items: true },
      });
      if (dbCart) {
        const itemsMap = new Map<string, StoredCartItemRecord>();
        for (const item of dbCart.items) {
          itemsMap.set(item.productId, {
            id: item.id,
            productId: item.productId,
            quantity: item.quantity,
            desiredQuantity: item.desiredQuantity,
            snapshotPricePaise: item.snapshotPricePaise,
            updatedAt: item.updatedAt.toISOString(),
          });
        }
        memCart = {
          id: dbCart.id,
          userId: dbCart.userId,
          pinCode: dbCart.pinCode ?? defaultPinCode ?? "560038",
          items: itemsMap,
          updatedAt: dbCart.updatedAt.toISOString(),
        };
        inMemoryCarts.set(userId, memCart);
      }
    } catch {
      // Use inMemoryCarts fallback
    }
  }

  return memCart;
}

async function persistStoredCartToDb(cart: StoredCustomerCart): Promise<void> {
  cart.updatedAt = new Date().toISOString();
  inMemoryCarts.set(cart.userId, cart);

  if (!process.env.DATABASE_URL) {
    return;
  }

  try {
    const upsertedCart = await prisma.cart.upsert({
      where: { userId: cart.userId },
      update: { pinCode: cart.pinCode },
      create: {
        id: cart.id,
        userId: cart.userId,
        pinCode: cart.pinCode,
      },
    });

    await prisma.cartItem.deleteMany({
      where: { cartId: upsertedCart.id },
    });

    const itemsArray = Array.from(cart.items.values());
    if (itemsArray.length > 0) {
      await prisma.cartItem.createMany({
        data: itemsArray.map((item) => ({
          id: item.id,
          cartId: upsertedCart.id,
          productId: item.productId,
          quantity: item.quantity,
          desiredQuantity: item.desiredQuantity,
          snapshotPricePaise: item.snapshotPricePaise,
        })),
      });
    }
  } catch {
    // Fallback already persisted in inMemoryCarts
  }
}

/**
 * Recomputes the customer's cart from authoritative server-side product records,
 * generating explicit warnings if any item was deactivated, sold out, dropped in stock,
 * or changed in price since it was added.
 */
export async function getCustomerCart(
  userId: string,
  defaultPinCode?: string | null
): Promise<CustomerCartView> {
  const stored = await getOrCreateStoredCart(userId, defaultPinCode);
  const pinInfo = stored.pinCode
    ? await lookupServiceablePinCode(stored.pinCode)
    : null;

  const deliveryStateCode = pinInfo?.stateCode ?? brandConfig.sellerStateCode;
  const baseShippingFeePaise = pinInfo?.shippingFeePaise ?? 0;

  const lineViews: CartLineView[] = [];
  const allWarnings: CartWarning[] = [];
  let hasBlockingIssues = false;
  let maxProcessingDays = 1;

  for (const storedItem of stored.items.values()) {
    const product = await getProductRecordByIdIncludingInactive(
      storedItem.productId
    );
    if (!product) {
      continue;
    }

    const lineWarnings: CartWarning[] = [];
    const maxAllowedQuantity = product.isActive
      ? Math.min(product.stock.displayedStock, MAX_QTY_PER_LINE)
      : 0;

    let effectiveQuantity = storedItem.desiredQuantity;

    if (!product.isActive) {
      effectiveQuantity = 0;
      hasBlockingIssues = true;
      const w: CartWarning = {
        code: "ITEM_DEACTIVATED",
        productId: product.id,
        productName: product.name,
        message: `"${product.name}" has been archived from the studio catalogue and is no longer available for purchase. Please remove it from your cart.`,
      };
      lineWarnings.push(w);
      allWarnings.push(w);
    } else if (
      !product.stock.isPurchasable ||
      product.stock.displayedStock <= 0
    ) {
      effectiveQuantity = 0;
      hasBlockingIssues = true;
      const w: CartWarning = {
        code: "ITEM_OUT_OF_STOCK",
        productId: product.id,
        productName: product.name,
        desiredQuantity: storedItem.desiredQuantity,
        availableQuantity: 0,
        message: `"${product.name}" is now out of stock (you had ${storedItem.desiredQuantity} in your cart). Remove this item to proceed to checkout.`,
      };
      lineWarnings.push(w);
      allWarnings.push(w);
    } else if (storedItem.desiredQuantity > maxAllowedQuantity) {
      effectiveQuantity = maxAllowedQuantity;
      const w: CartWarning = {
        code: "QUANTITY_REDUCED_BY_STOCK",
        productId: product.id,
        productName: product.name,
        desiredQuantity: storedItem.desiredQuantity,
        availableQuantity: maxAllowedQuantity,
        message: `Only ${maxAllowedQuantity} ${
          maxAllowedQuantity === 1 ? "unit" : "units"
        } of "${product.name}" remain available (down from ${storedItem.desiredQuantity} in your cart). Your payable quantity has been adjusted to ${maxAllowedQuantity}.`,
      };
      lineWarnings.push(w);
      allWarnings.push(w);
    }

    const priceChanged =
      storedItem.snapshotPricePaise > 0 &&
      storedItem.snapshotPricePaise !== product.pricePaise;

    if (priceChanged) {
      const w: CartWarning = {
        code: "PRICE_CHANGED",
        productId: product.id,
        productName: product.name,
        previousPricePaise: storedItem.snapshotPricePaise,
        currentPricePaise: product.pricePaise,
        message: `The price of "${product.name}" changed from ${formatInrFromPaise(
          storedItem.snapshotPricePaise
        )} to ${formatInrFromPaise(
          product.pricePaise
        )}. Your cart total has been updated to the current studio price.`,
      };
      lineWarnings.push(w);
      allWarnings.push(w);
    }

    if (effectiveQuantity > 0 && product.dispatchTimeDays > maxProcessingDays) {
      maxProcessingDays = product.dispatchTimeDays;
    }

    const singleLineTotals = computeBasketTotals({
      lines: [
        {
          productId: product.id,
          slug: product.slug,
          name: product.name,
          hsnCode: product.hsnCode,
          unitPricePaise: product.pricePaise,
          quantity: effectiveQuantity,
          taxSlab: product.taxSlab,
        },
      ],
      deliveryStateCode,
      sellerStateCode: brandConfig.sellerStateCode,
      pinZoneShippingFeePaise: 0,
    });

    const taxBreakdown: ComputedLineTaxBreakdown =
      singleLineTotals.lines[0] ?? {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        hsnCode: product.hsnCode,
        unitPricePaise: product.pricePaise,
        quantity: 0,
        lineTotalPaise: 0,
        taxableAmountPaise: 0,
        taxRatePercent: 12,
        totalTaxPaise: 0,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 0,
      };

    lineViews.push({
      itemId: storedItem.id,
      productId: product.id,
      slug: product.slug,
      name: product.name,
      category: product.category,
      hsnCode: product.hsnCode,
      taxSlab: product.taxSlab,
      primaryImage: product.images[0] ?? null,
      isActive: product.isActive,
      isPurchasable: product.stock.isPurchasable,
      displayedStock: product.stock.displayedStock,
      maxAllowedQuantity,
      stockLabel: product.stock.label,
      desiredQuantity: storedItem.desiredQuantity,
      effectiveQuantity,
      snapshotPricePaise: storedItem.snapshotPricePaise,
      currentUnitPricePaise: product.pricePaise,
      priceChanged,
      taxBreakdown,
      warnings: lineWarnings,
    });
  }

  const basketTotals = computeBasketTotals({
    lines: lineViews
      .filter((l) => l.effectiveQuantity > 0)
      .map((l) => ({
        productId: l.productId,
        slug: l.slug,
        name: l.name,
        hsnCode: l.hsnCode,
        unitPricePaise: l.currentUnitPricePaise,
        quantity: l.effectiveQuantity,
        taxSlab: l.taxSlab,
      })),
    deliveryStateCode,
    sellerStateCode: brandConfig.sellerStateCode,
    pinZoneShippingFeePaise: baseShippingFeePaise,
  });

  const deliveryEstimate =
    pinInfo && basketTotals.totalQuantity > 0
      ? estimateDelivery({
          processingDays: maxProcessingDays,
          transitDays: pinInfo.transitDays,
        })
      : null;

  return {
    userId,
    pinCode: stored.pinCode,
    pinServiceability: pinInfo
      ? {
          pinCode: pinInfo.pinCode,
          city: pinInfo.city,
          state: pinInfo.state,
          stateCode: pinInfo.stateCode,
          zoneCode: pinInfo.zoneCode,
          transitDays: pinInfo.transitDays,
          baseShippingFeePaise: pinInfo.shippingFeePaise,
          codAvailable: pinInfo.codAvailable,
        }
      : null,
    deliveryEstimate,
    lines: lineViews,
    warnings: allWarnings,
    hasBlockingIssues,
    totals: basketTotals,
    updatedAt: stored.updatedAt,
  };
}

/**
 * Adds a product to the authenticated customer's cart or increments its quantity,
 * enforcing `min(displayedStock, MAX_QTY_PER_LINE)`.
 * Browser-supplied prices are never accepted.
 */
export async function addItemToCustomerCart(params: {
  userId: string;
  productId: string;
  quantityToAdd: number;
}): Promise<
  | {
      ok: true;
      cart: CustomerCartView;
      cappedByStock: boolean;
      appliedQuantity: number;
      notice?: string;
    }
  | {
      ok: false;
      code: "PRODUCT_NOT_FOUND" | "PRODUCT_INACTIVE" | "OUT_OF_STOCK";
      message: string;
    }
> {
  const product = await getProductRecordByIdIncludingInactive(params.productId);
  if (!product) {
    return {
      ok: false,
      code: "PRODUCT_NOT_FOUND",
      message: "Could not find that product in the studio catalogue.",
    };
  }

  if (!product.isActive) {
    return {
      ok: false,
      code: "PRODUCT_INACTIVE",
      message: "This piece has been archived from the catalogue and cannot be added to your cart.",
    };
  }

  if (!product.stock.isPurchasable || product.stock.displayedStock <= 0) {
    return {
      ok: false,
      code: "OUT_OF_STOCK",
      message: `"${product.name}" is currently out of stock.`,
    };
  }

  const stored = await getOrCreateStoredCart(params.userId);
  const existing = stored.items.get(product.id);
  const requestedAdd = Math.max(1, Math.floor(params.quantityToAdd));
  const rawTargetQty = (existing?.desiredQuantity ?? 0) + requestedAdd;
  const maxAllowed = Math.min(product.stock.displayedStock, MAX_QTY_PER_LINE);
  const appliedQuantity = Math.min(rawTargetQty, maxAllowed);
  const cappedByStock = rawTargetQty > maxAllowed;

  stored.items.set(product.id, {
    id: existing?.id ?? crypto.randomUUID(),
    productId: product.id,
    quantity: appliedQuantity,
    desiredQuantity: appliedQuantity,
    snapshotPricePaise: existing?.snapshotPricePaise ?? product.pricePaise,
    updatedAt: new Date().toISOString(),
  });

  await persistStoredCartToDb(stored);
  const cart = await getCustomerCart(params.userId);

  return {
    ok: true,
    cart,
    cappedByStock,
    appliedQuantity,
    ...(cappedByStock
      ? {
          notice: `Quantity for "${product.name}" is capped at ${maxAllowed} (maximum available studio stock or per-order limit).`,
        }
      : {}),
  };
}

/**
 * Updates the quantity of an existing cart line (`0` removes the item).
 */
export async function updateCustomerCartItemQuantity(params: {
  userId: string;
  productId: string;
  quantity: number;
}): Promise<
  | {
      ok: true;
      cart: CustomerCartView;
      cappedByStock: boolean;
      appliedQuantity: number;
      notice?: string;
    }
  | {
      ok: false;
      code: "ITEM_NOT_IN_CART" | "PRODUCT_INACTIVE" | "OUT_OF_STOCK";
      message: string;
    }
> {
  const stored = await getOrCreateStoredCart(params.userId);
  const existing = stored.items.get(params.productId);
  if (!existing) {
    return {
      ok: false,
      code: "ITEM_NOT_IN_CART",
      message: "That item is no longer in your cart.",
    };
  }

  const requestedQty = Math.floor(params.quantity);
  if (requestedQty <= 0) {
    stored.items.delete(params.productId);
    await persistStoredCartToDb(stored);
    return {
      ok: true,
      cart: await getCustomerCart(params.userId),
      cappedByStock: false,
      appliedQuantity: 0,
    };
  }

  const product = await getProductRecordByIdIncludingInactive(params.productId);
  if (!product || !product.isActive) {
    return {
      ok: false,
      code: "PRODUCT_INACTIVE",
      message: "This piece is no longer active in the catalogue. Please remove it from your cart.",
    };
  }

  if (!product.stock.isPurchasable || product.stock.displayedStock <= 0) {
    return {
      ok: false,
      code: "OUT_OF_STOCK",
      message: `"${product.name}" is currently out of stock.`,
    };
  }

  const maxAllowed = Math.min(product.stock.displayedStock, MAX_QTY_PER_LINE);
  const appliedQuantity = Math.min(requestedQty, maxAllowed);
  const cappedByStock = requestedQty > maxAllowed;

  stored.items.set(product.id, {
    ...existing,
    quantity: appliedQuantity,
    desiredQuantity: appliedQuantity,
    snapshotPricePaise: product.pricePaise,
    updatedAt: new Date().toISOString(),
  });

  await persistStoredCartToDb(stored);
  const cart = await getCustomerCart(params.userId);

  return {
    ok: true,
    cart,
    cappedByStock,
    appliedQuantity,
    ...(cappedByStock
      ? {
          notice: `Maximum available quantity for "${product.name}" is ${maxAllowed}.`,
        }
      : {}),
  };
}

/**
 * Removes a single product line from the customer's cart.
 */
export async function removeItemFromCustomerCart(params: {
  userId: string;
  productId: string;
}): Promise<CustomerCartView> {
  const stored = await getOrCreateStoredCart(params.userId);
  stored.items.delete(params.productId);
  await persistStoredCartToDb(stored);
  return getCustomerCart(params.userId);
}

/**
 * Clears all items from the customer's cart.
 */
export async function clearCustomerCart(
  userId: string
): Promise<CustomerCartView> {
  const stored = await getOrCreateStoredCart(userId);
  stored.items.clear();
  await persistStoredCartToDb(stored);
  return getCustomerCart(userId);
}

/**
 * Updates the delivery PIN code on the customer's cart and recalculates
 * PIN-zone shipping, intra-state vs inter-state GST split (CGST+SGST vs IGST),
 * and estimated delivery dates. Returns a clear error for unserviceable PIN codes.
 */
export async function setCustomerCartPinCode(params: {
  userId: string;
  pinCode: string;
}): Promise<
  | { ok: true; cart: CustomerCartView }
  | { ok: false; code: "PIN_CODE_UNSERVICEABLE"; message: string }
> {
  const cleaned = params.pinCode.trim();
  const pinInfo = await lookupServiceablePinCode(cleaned);
  if (!pinInfo) {
    return {
      ok: false,
      code: "PIN_CODE_UNSERVICEABLE",
      message: `PIN code ${cleaned} is not currently serviceable. Enter a serviceable 6-digit Indian PIN code (for example 560001, 400001, 110001, or 600001).`,
    };
  }

  const stored = await getOrCreateStoredCart(params.userId);
  stored.pinCode = pinInfo.pinCode;
  await persistStoredCartToDb(stored);

  return {
    ok: true,
    cart: await getCustomerCart(params.userId),
  };
}
