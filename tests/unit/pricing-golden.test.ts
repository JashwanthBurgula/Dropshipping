import { describe, expect, it } from "vitest";
import {
  computeBasketTotals,
  computeLineTaxBreakdown,
  type BasketLineInput,
} from "@/lib/pricing/gst";
import { brandConfig } from "@/config/brand";

export interface GoldenBasketTestCase {
  id: string;
  description: string;
  lines: BasketLineInput[];
  sellerStateCode: string;
  deliveryStateCode: string;
  pinZoneShippingFeePaise: number;
  expected: {
    subtotalPaise: number;
    taxableSubtotalPaise: number;
    cgstTotalPaise: number;
    sgstTotalPaise: number;
    igstTotalPaise: number;
    totalTaxPaise: number;
    shippingPaise: number;
    grandTotalPaise: number;
  };
}

/**
 * 12 hand-computed golden baskets covering:
 * - GST slabs: 5% ("GST_5"), 12% ("GST_12"), 18% ("GST_18")
 * - Single-unit and multi-unit quantities (qty = 1, 2, 3, 5)
 * - Mixed GST slabs in the same basket
 * - Exact boundary around Rs 999 (99900 paise) post-tax subtotal:
 *   - 99800 paise (Rs 998.00) -> Rs 79.00 (7900 paise) shipping
 *   - 99900 paise (Rs 999.00) -> Rs 0.00 (0 paise) free shipping
 *   - 100000 paise (Rs 1,000.00) -> Rs 0.00 (0 paise) free shipping
 * - Intra-state (KA -> KA, CGST + SGST with odd-paisa deterministic remainder)
 * - Inter-state (KA -> MH, DL, TN, WB, IGST)
 */
export const GOLDEN_BASKET_CASES: GoldenBasketTestCase[] = [
  {
    id: "GB-01",
    description:
      "5% GST slab, qty 1, intra-state KA->KA, below Rs 999 threshold (Rs 525.00)",
    lines: [
      {
        productId: "prod-5pct-1",
        hsnCode: "69120020",
        unitPricePaise: 52500, // 52500 * 100 / 105 = 50000 taxable, 2500 tax (1250 CGST + 1250 SGST)
        quantity: 1,
        taxSlab: "GST_5",
      },
    ],
    sellerStateCode: "KA",
    deliveryStateCode: "KA",
    pinZoneShippingFeePaise: 7900,
    expected: {
      subtotalPaise: 52500,
      taxableSubtotalPaise: 50000,
      cgstTotalPaise: 1250,
      sgstTotalPaise: 1250,
      igstTotalPaise: 0,
      totalTaxPaise: 2500,
      shippingPaise: 7900,
      grandTotalPaise: 60400,
    },
  },
  {
    id: "GB-02",
    description:
      "5% GST slab, qty 3, inter-state KA->MH, above Rs 999 threshold (Rs 1,050.00)",
    lines: [
      {
        productId: "prod-5pct-3",
        hsnCode: "69120020",
        unitPricePaise: 35000, // line = 105000 -> 100000 taxable, 5000 IGST
        quantity: 3,
        taxSlab: "GST_5",
      },
    ],
    sellerStateCode: "KA",
    deliveryStateCode: "MH",
    pinZoneShippingFeePaise: 9900,
    expected: {
      subtotalPaise: 105000,
      taxableSubtotalPaise: 100000,
      cgstTotalPaise: 0,
      sgstTotalPaise: 0,
      igstTotalPaise: 5000,
      totalTaxPaise: 5000,
      shippingPaise: 0,
      grandTotalPaise: 105000,
    },
  },
  {
    id: "GB-03",
    description:
      "12% GST slab, qty 1, intra-state KA->KA, odd-paisa tax split (Rs 850.00)",
    lines: [
      {
        productId: "prod-12pct-odd",
        hsnCode: "69120010",
        // 85000 * 100 / 112 = 75892.857... -> rounds to 75893 taxable
        // totalTax = 85000 - 75893 = 9107 (odd!) -> CGST = 4553, SGST = 4554
        unitPricePaise: 85000,
        quantity: 1,
        taxSlab: "GST_12",
      },
    ],
    sellerStateCode: "KA",
    deliveryStateCode: "KA",
    pinZoneShippingFeePaise: 7900,
    expected: {
      subtotalPaise: 85000,
      taxableSubtotalPaise: 75893,
      cgstTotalPaise: 4553,
      sgstTotalPaise: 4554,
      igstTotalPaise: 0,
      totalTaxPaise: 9107,
      shippingPaise: 7900,
      grandTotalPaise: 92900,
    },
  },
  {
    id: "GB-04",
    description:
      "12% GST slab, qty 2, inter-state KA->DL, above Rs 999 threshold (Rs 3,600.00)",
    lines: [
      {
        productId: "prod-12pct-2",
        hsnCode: "69120010",
        // line = 360000 -> 360000 * 100 / 112 = 321428.571... -> 321429 taxable, 38571 IGST
        unitPricePaise: 180000,
        quantity: 2,
        taxSlab: "GST_12",
      },
    ],
    sellerStateCode: "KA",
    deliveryStateCode: "DL",
    pinZoneShippingFeePaise: 11900,
    expected: {
      subtotalPaise: 360000,
      taxableSubtotalPaise: 321429,
      cgstTotalPaise: 0,
      sgstTotalPaise: 0,
      igstTotalPaise: 38571,
      totalTaxPaise: 38571,
      shippingPaise: 0,
      grandTotalPaise: 360000,
    },
  },
  {
    id: "GB-05",
    description:
      "18% GST slab, qty 1, intra-state KA->KA, above Rs 999 threshold (Rs 2,950.00)",
    lines: [
      {
        productId: "prod-18pct-1",
        hsnCode: "94052090",
        // 295000 * 100 / 118 = 250000 taxable, 45000 tax (22500 CGST + 22500 SGST)
        unitPricePaise: 295000,
        quantity: 1,
        taxSlab: "GST_18",
      },
    ],
    sellerStateCode: "KA",
    deliveryStateCode: "KA",
    pinZoneShippingFeePaise: 7900,
    expected: {
      subtotalPaise: 295000,
      taxableSubtotalPaise: 250000,
      cgstTotalPaise: 22500,
      sgstTotalPaise: 22500,
      igstTotalPaise: 0,
      totalTaxPaise: 45000,
      shippingPaise: 0,
      grandTotalPaise: 295000,
    },
  },
  {
    id: "GB-06",
    description:
      "18% GST slab, qty 2, inter-state KA->TN, odd-paisa line tax (Rs 4,900.00)",
    lines: [
      {
        productId: "prod-18pct-2",
        hsnCode: "74181021",
        // line = 490000 -> 490000 * 100 / 118 = 415254.237... -> 415254 taxable, 74746 IGST
        unitPricePaise: 245000,
        quantity: 2,
        taxSlab: "GST_18",
      },
    ],
    sellerStateCode: "KA",
    deliveryStateCode: "TN",
    pinZoneShippingFeePaise: 8900,
    expected: {
      subtotalPaise: 490000,
      taxableSubtotalPaise: 415254,
      cgstTotalPaise: 0,
      sgstTotalPaise: 0,
      igstTotalPaise: 74746,
      totalTaxPaise: 74746,
      shippingPaise: 0,
      grandTotalPaise: 490000,
    },
  },
  {
    id: "GB-07",
    description:
      "Boundary test: Rs 998.00 (99800 paise) subtotal -> charges Rs 79.00 shipping",
    lines: [
      {
        productId: "prod-boundary-998",
        hsnCode: "69120010",
        // 99800 * 100 / 112 = 89107.142... -> 89107 taxable, 10693 tax (5346 CGST + 5347 SGST)
        unitPricePaise: 99800,
        quantity: 1,
        taxSlab: "GST_12",
      },
    ],
    sellerStateCode: "KA",
    deliveryStateCode: "KA",
    pinZoneShippingFeePaise: 7900,
    expected: {
      subtotalPaise: 99800,
      taxableSubtotalPaise: 89107,
      cgstTotalPaise: 5346,
      sgstTotalPaise: 5347,
      igstTotalPaise: 0,
      totalTaxPaise: 10693,
      shippingPaise: 7900,
      grandTotalPaise: 107700,
    },
  },
  {
    id: "GB-08",
    description:
      "Boundary test: exact Rs 999.00 (99900 paise) subtotal -> Rs 0.00 free shipping",
    lines: [
      {
        productId: "prod-boundary-999",
        hsnCode: "69120010",
        // 99900 * 100 / 112 = 89196.428... -> 89196 taxable, 10704 tax (5352 CGST + 5352 SGST)
        unitPricePaise: 99900,
        quantity: 1,
        taxSlab: "GST_12",
      },
    ],
    sellerStateCode: "KA",
    deliveryStateCode: "KA",
    pinZoneShippingFeePaise: 7900,
    expected: {
      subtotalPaise: 99900,
      taxableSubtotalPaise: 89196,
      cgstTotalPaise: 5352,
      sgstTotalPaise: 5352,
      igstTotalPaise: 0,
      totalTaxPaise: 10704,
      shippingPaise: 0,
      grandTotalPaise: 99900,
    },
  },
  {
    id: "GB-09",
    description:
      "Boundary test: Rs 1,000.00 (100000 paise) subtotal -> Rs 0.00 free shipping",
    lines: [
      {
        productId: "prod-boundary-1000",
        hsnCode: "69120010",
        // 100000 * 100 / 112 = 89285.714... -> 89286 taxable, 10714 IGST
        unitPricePaise: 100000,
        quantity: 1,
        taxSlab: "GST_12",
      },
    ],
    sellerStateCode: "KA",
    deliveryStateCode: "MH",
    pinZoneShippingFeePaise: 9900,
    expected: {
      subtotalPaise: 100000,
      taxableSubtotalPaise: 89286,
      cgstTotalPaise: 0,
      sgstTotalPaise: 0,
      igstTotalPaise: 10714,
      totalTaxPaise: 10714,
      shippingPaise: 0,
      grandTotalPaise: 100000,
    },
  },
  {
    id: "GB-10",
    description:
      "Mixed 5% + 12% + 18% GST slabs in one basket, intra-state KA->KA",
    lines: [
      {
        productId: "prod-mix-5",
        hsnCode: "520811",
        // 2 * 52500 = 105000 -> 100000 taxable, 5000 tax (2500 CGST + 2500 SGST)
        unitPricePaise: 52500,
        quantity: 2,
        taxSlab: "GST_5",
      },
      {
        productId: "prod-mix-12",
        hsnCode: "69120010",
        // 1 * 112000 = 112000 -> 100000 taxable, 12000 tax (6000 CGST + 6000 SGST)
        unitPricePaise: 112000,
        quantity: 1,
        taxSlab: "GST_12",
      },
      {
        productId: "prod-mix-18",
        hsnCode: "94052090",
        // 1 * 236000 = 236000 -> 200000 taxable, 36000 tax (18000 CGST + 18000 SGST)
        unitPricePaise: 236000,
        quantity: 1,
        taxSlab: "GST_18",
      },
    ],
    sellerStateCode: "KA",
    deliveryStateCode: "KA",
    pinZoneShippingFeePaise: 7900,
    expected: {
      subtotalPaise: 453000,
      taxableSubtotalPaise: 400000,
      cgstTotalPaise: 26500,
      sgstTotalPaise: 26500,
      igstTotalPaise: 0,
      totalTaxPaise: 53000,
      shippingPaise: 0,
      grandTotalPaise: 453000,
    },
  },
  {
    id: "GB-11",
    description:
      "Mixed 12% + 18% GST slabs with multi-qty, inter-state KA->WB",
    lines: [
      {
        productId: "prod-wb-12",
        hsnCode: "69120010",
        // 3 * 125000 = 375000 -> 375000 * 100 / 112 = 334821.428... -> 334821 taxable, 40179 IGST
        unitPricePaise: 125000,
        quantity: 3,
        taxSlab: "GST_12",
      },
      {
        productId: "prod-wb-18",
        hsnCode: "74181021",
        // 2 * 165000 = 330000 -> 330000 * 100 / 118 = 279661.016... -> 279661 taxable, 50339 IGST
        unitPricePaise: 165000,
        quantity: 2,
        taxSlab: "GST_18",
      },
    ],
    sellerStateCode: "KA",
    deliveryStateCode: "WB",
    pinZoneShippingFeePaise: 12900,
    expected: {
      subtotalPaise: 705000,
      taxableSubtotalPaise: 614482,
      cgstTotalPaise: 0,
      sgstTotalPaise: 0,
      igstTotalPaise: 90518,
      totalTaxPaise: 90518,
      shippingPaise: 0,
      grandTotalPaise: 705000,
    },
  },
  {
    id: "GB-12",
    description:
      "Multi-quantity small items (5 x Rs 189.00 = Rs 945.00), inter-state KA->MH, below Rs 999",
    lines: [
      {
        productId: "prod-small-5x",
        hsnCode: "69120020",
        // 5 * 18900 = 94500 -> 94500 * 100 / 105 = 90000 taxable, 4500 IGST
        unitPricePaise: 18900,
        quantity: 5,
        taxSlab: "GST_5",
      },
    ],
    sellerStateCode: "KA",
    deliveryStateCode: "MH",
    pinZoneShippingFeePaise: 7900,
    expected: {
      subtotalPaise: 94500,
      taxableSubtotalPaise: 90000,
      cgstTotalPaise: 0,
      sgstTotalPaise: 0,
      igstTotalPaise: 4500,
      totalTaxPaise: 4500,
      shippingPaise: 7900,
      grandTotalPaise: 102400,
    },
  },
];

describe("Server-side Paise GST & Basket Totals Engine (12 Golden Baskets)", () => {
  it("verifies brandConfig.freeShippingThresholdPaise is 99900 (Rs 999) and sellerStateCode is KA", () => {
    expect(brandConfig.freeShippingThresholdPaise).toBe(99900);
    expect(brandConfig.sellerStateCode).toBe("KA");
  });

  it.each(GOLDEN_BASKET_CASES)("$id: $description", (golden) => {
    const actual = computeBasketTotals({
      lines: golden.lines,
      sellerStateCode: golden.sellerStateCode,
      deliveryStateCode: golden.deliveryStateCode,
      pinZoneShippingFeePaise: golden.pinZoneShippingFeePaise,
    });

    expect(actual.subtotalPaise).toBe(golden.expected.subtotalPaise);
    expect(actual.taxableSubtotalPaise).toBe(
      golden.expected.taxableSubtotalPaise
    );
    expect(actual.cgstTotalPaise).toBe(golden.expected.cgstTotalPaise);
    expect(actual.sgstTotalPaise).toBe(golden.expected.sgstTotalPaise);
    expect(actual.igstTotalPaise).toBe(golden.expected.igstTotalPaise);
    expect(actual.totalTaxPaise).toBe(golden.expected.totalTaxPaise);
    expect(actual.shippingPaise).toBe(golden.expected.shippingPaise);
    expect(actual.grandTotalPaise).toBe(golden.expected.grandTotalPaise);

    // Invariant 1: taxable + totalTax === subtotalPaise
    expect(actual.taxableSubtotalPaise + actual.totalTaxPaise).toBe(
      actual.subtotalPaise
    );
    // Invariant 2: CGST + SGST + IGST === totalTax
    expect(
      actual.cgstTotalPaise + actual.sgstTotalPaise + actual.igstTotalPaise
    ).toBe(actual.totalTaxPaise);
    // Invariant 3: subtotal + shipping === grandTotal
    expect(actual.subtotalPaise + actual.shippingPaise).toBe(
      actual.grandTotalPaise
    );
  });

  it("handles zero-quantity or empty baskets cleanly with zero shipping fee", () => {
    const empty = computeBasketTotals({
      lines: [],
      sellerStateCode: "KA",
      deliveryStateCode: "KA",
      pinZoneShippingFeePaise: 7900,
    });
    expect(empty.subtotalPaise).toBe(0);
    expect(empty.shippingPaise).toBe(0);
    expect(empty.grandTotalPaise).toBe(0);
  });

  it("validates single-line tax breakdown invariants across all GST slabs", () => {
    for (const rate of [0, 5, 12, 18, 28]) {
      const intra = computeLineTaxBreakdown(
        {
          productId: `p-${rate}`,
          hsnCode: "69120010",
          unitPricePaise: 99999,
          quantity: 3,
          taxSlab: rate,
        },
        true
      );
      expect(intra.taxableAmountPaise + intra.totalTaxPaise).toBe(
        intra.lineTotalPaise
      );
      expect(intra.cgstPaise + intra.sgstPaise).toBe(intra.totalTaxPaise);
      expect(intra.igstPaise).toBe(0);
    }
  });

  it("verifies per-line tax breakdowns for multi-line golden baskets GB-10 and GB-11 and confirms invoice tax is the sum of per-line tax", () => {
    const gb10Case = GOLDEN_BASKET_CASES.find((c) => c.id === "GB-10")!;
    const gb10 = computeBasketTotals({
      lines: gb10Case.lines,
      sellerStateCode: gb10Case.sellerStateCode,
      deliveryStateCode: gb10Case.deliveryStateCode,
      pinZoneShippingFeePaise: gb10Case.pinZoneShippingFeePaise,
    });

    expect(gb10.lines).toEqual([
      {
        productId: "prod-mix-5",
        slug: undefined,
        name: undefined,
        hsnCode: "520811",
        unitPricePaise: 52500,
        quantity: 2,
        lineTotalPaise: 105000,
        taxableAmountPaise: 100000,
        taxRatePercent: 5,
        totalTaxPaise: 5000,
        cgstPaise: 2500,
        sgstPaise: 2500,
        igstPaise: 0,
      },
      {
        productId: "prod-mix-12",
        slug: undefined,
        name: undefined,
        hsnCode: "69120010",
        unitPricePaise: 112000,
        quantity: 1,
        lineTotalPaise: 112000,
        taxableAmountPaise: 100000,
        taxRatePercent: 12,
        totalTaxPaise: 12000,
        cgstPaise: 6000,
        sgstPaise: 6000,
        igstPaise: 0,
      },
      {
        productId: "prod-mix-18",
        slug: undefined,
        name: undefined,
        hsnCode: "94052090",
        unitPricePaise: 236000,
        quantity: 1,
        lineTotalPaise: 236000,
        taxableAmountPaise: 200000,
        taxRatePercent: 18,
        totalTaxPaise: 36000,
        cgstPaise: 18000,
        sgstPaise: 18000,
        igstPaise: 0,
      },
    ]);

    const gb11Case = GOLDEN_BASKET_CASES.find((c) => c.id === "GB-11")!;
    const gb11 = computeBasketTotals({
      lines: gb11Case.lines,
      sellerStateCode: gb11Case.sellerStateCode,
      deliveryStateCode: gb11Case.deliveryStateCode,
      pinZoneShippingFeePaise: gb11Case.pinZoneShippingFeePaise,
    });

    expect(gb11.lines).toEqual([
      {
        productId: "prod-wb-12",
        slug: undefined,
        name: undefined,
        hsnCode: "69120010",
        unitPricePaise: 125000,
        quantity: 3,
        lineTotalPaise: 375000,
        taxableAmountPaise: 334821,
        taxRatePercent: 12,
        totalTaxPaise: 40179,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 40179,
      },
      {
        productId: "prod-wb-18",
        slug: undefined,
        name: undefined,
        hsnCode: "74181021",
        unitPricePaise: 165000,
        quantity: 2,
        lineTotalPaise: 330000,
        taxableAmountPaise: 279661,
        taxRatePercent: 18,
        totalTaxPaise: 50339,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 50339,
      },
    ]);
  });

  it("property test over 500 random baskets: taxable+tax=subtotal, intra CGST+SGST=tax, inter IGST=tax, invoice tax equals sum of per-line tax, and no negative or fractional paise", () => {
    // Deterministic PRNG (Mulberry32) so failures are 100% reproducible
    let seed = 0x20261012;
    const nextRand = (): number => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const randInt = (min: number, max: number): number =>
      Math.floor(nextRand() * (max - min + 1)) + min;

    const slabs = ["GST_0", "GST_5", "GST_12", "GST_18", "GST_28"] as const;
    const states = ["KA", "MH", "DL", "TN", "WB", "GJ", "UP", "KL"] as const;

    for (let trial = 0; trial < 500; trial++) {
      const lineCount = randInt(1, 8);
      const sellerStateCode = states[randInt(0, states.length - 1)]!;
      const deliveryStateCode = states[randInt(0, states.length - 1)]!;
      const pinZoneShippingFeePaise = randInt(0, 25000);

      const lines: BasketLineInput[] = [];
      for (let i = 0; i < lineCount; i++) {
        lines.push({
          productId: `rand-prod-${trial}-${i}`,
          hsnCode: String(randInt(1000, 99999999)),
          unitPricePaise: randInt(100, 2500000),
          quantity: randInt(1, 15),
          taxSlab: slabs[randInt(0, slabs.length - 1)]!,
        });
      }

      const totals = computeBasketTotals({
        lines,
        sellerStateCode,
        deliveryStateCode,
        pinZoneShippingFeePaise,
      });

      const isIntra = sellerStateCode === deliveryStateCode;
      expect(totals.isIntraState).toBe(isIntra);

      // Check all top-level amounts are non-negative integers (no negative or fractional paise)
      const numericTopFields = [
        totals.subtotalPaise,
        totals.taxableSubtotalPaise,
        totals.cgstTotalPaise,
        totals.sgstTotalPaise,
        totals.igstTotalPaise,
        totals.totalTaxPaise,
        totals.shippingPaise,
        totals.grandTotalPaise,
        totals.amountRemainingForFreeShippingPaise,
      ];
      for (const val of numericTopFields) {
        expect(Number.isInteger(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(0);
      }

      let sumLineSubtotal = 0;
      let sumLineTaxable = 0;
      let sumLineCgst = 0;
      let sumLineSgst = 0;
      let sumLineIgst = 0;
      let sumLineTax = 0;

      for (const line of totals.lines) {
        // Non-negative integer paise on every line field
        for (const lv of [
          line.unitPricePaise,
          line.quantity,
          line.lineTotalPaise,
          line.taxableAmountPaise,
          line.totalTaxPaise,
          line.cgstPaise,
          line.sgstPaise,
          line.igstPaise,
        ]) {
          expect(Number.isInteger(lv)).toBe(true);
          expect(lv).toBeGreaterThanOrEqual(0);
        }

        // Line invariant: taxable + tax === lineTotal
        expect(line.taxableAmountPaise + line.totalTaxPaise).toBe(
          line.lineTotalPaise
        );

        if (isIntra) {
          expect(line.cgstPaise + line.sgstPaise).toBe(line.totalTaxPaise);
          expect(line.igstPaise).toBe(0);
        } else {
          expect(line.igstPaise).toBe(line.totalTaxPaise);
          expect(line.cgstPaise).toBe(0);
          expect(line.sgstPaise).toBe(0);
        }

        sumLineSubtotal += line.lineTotalPaise;
        sumLineTaxable += line.taxableAmountPaise;
        sumLineCgst += line.cgstPaise;
        sumLineSgst += line.sgstPaise;
        sumLineIgst += line.igstPaise;
        sumLineTax += line.totalTaxPaise;
      }

      // Invoice tax is strictly the sum of per-line tax
      expect(totals.subtotalPaise).toBe(sumLineSubtotal);
      expect(totals.taxableSubtotalPaise).toBe(sumLineTaxable);
      expect(totals.cgstTotalPaise).toBe(sumLineCgst);
      expect(totals.sgstTotalPaise).toBe(sumLineSgst);
      expect(totals.igstTotalPaise).toBe(sumLineIgst);
      expect(totals.totalTaxPaise).toBe(sumLineTax);

      // Basket-level invariants
      expect(totals.taxableSubtotalPaise + totals.totalTaxPaise).toBe(
        totals.subtotalPaise
      );
      if (isIntra) {
        expect(totals.cgstTotalPaise + totals.sgstTotalPaise).toBe(
          totals.totalTaxPaise
        );
        expect(totals.igstTotalPaise).toBe(0);
      } else {
        expect(totals.igstTotalPaise).toBe(totals.totalTaxPaise);
        expect(totals.cgstTotalPaise).toBe(0);
        expect(totals.sgstTotalPaise).toBe(0);
      }
      expect(totals.subtotalPaise + totals.shippingPaise).toBe(
        totals.grandTotalPaise
      );
    }
  });
});
