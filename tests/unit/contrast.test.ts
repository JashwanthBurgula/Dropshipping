import { describe, expect, it } from "vitest";
import { designTokens } from "../../src/styles/tokens";

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "").trim();
  if (normalized.length !== 6) {
    throw new Error(`Invalid 6-digit hex color: ${hex}`);
  }
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return [r, g, b];
}

function relativeLuminance(hex: string): number {
  const [r8, g8, b8] = hexToRgb(hex);
  const transform = (channel: number): number => {
    const sRGB = channel / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };
  const r = transform(r8);
  const g = transform(g8);
  const b = transform(b8);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function wcagContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = relativeLuminance(foregroundHex);
  const l2 = relativeLuminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("WCAG 2.2 AA Contrast Verification (>= 4.5:1)", () => {
  const { colors } = designTokens;

  const colorPairs: Array<{ label: string; fg: string; bg: string }> = [
    { label: "Text on Surface (#FFFFFF)", fg: colors.text, bg: colors.surface },
    { label: "Text on Page Background (#F5F6F7)", fg: colors.text, bg: colors.pageBg },
    { label: "Secondary text on Surface", fg: colors.secondaryText, bg: colors.surface },
    { label: "Secondary text on Page Background", fg: colors.secondaryText, bg: colors.pageBg },
    { label: "Header text on Header Navy (#0F2742)", fg: colors.headerNavyText, bg: colors.headerNavy },
    { label: "White text on Primary Blue (#1D4ED8)", fg: colors.primaryBlueText, bg: colors.primaryBlue },
    { label: "White text on Primary Blue Hover (#1E40AF)", fg: colors.primaryBlueText, bg: colors.primaryBlueHover },
    { label: "Dark text on Add to Cart Amber (#FFB400)", fg: colors.addToCartAmberText, bg: colors.addToCartAmber },
    { label: "White text on Buy Now Orange (#C2410C)", fg: colors.buyNowOrangeText, bg: colors.buyNowOrange },
    { label: "Success green on Surface", fg: colors.successGreen, bg: colors.surface },
    { label: "Price and discount red on Surface", fg: colors.priceRed, bg: colors.surface },
    { label: "Price and discount red on Page Background", fg: colors.priceRed, bg: colors.pageBg },
    { label: "Warning text on Warning background (#FEF3C7)", fg: colors.warningText, bg: colors.warningBg },
    { label: "Admin text on Admin Background", fg: colors.admin.text, bg: colors.admin.bg },
    { label: "Admin text on Admin Surface", fg: colors.admin.text, bg: colors.admin.surface },
    { label: "Admin muted text on Admin Surface", fg: colors.admin.textMuted, bg: colors.admin.surface },
  ];

  for (const pair of colorPairs) {
    it(`${pair.label} (${pair.fg} on ${pair.bg}) meets WCAG 2.2 AA (>= 4.5:1)`, () => {
      const ratio = wcagContrastRatio(pair.fg, pair.bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }
});
