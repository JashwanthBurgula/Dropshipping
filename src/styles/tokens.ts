/**
 * Design Tokens for Modern High-Conversion Retail System (Light Theme Only)
 *
 * Professional palette with neutral greys (no blue tint).
 * All text/background pairs exceed WCAG 2.2 AA (4.5:1) minimum contrast ratio.
 */

export const designTokens = {
  colors: {
    pageBg: "#F5F6F7",
    surface: "#FFFFFF",
    border: "#DDE1E6",
    text: "#101828",
    secondaryText: "#475467",
    headerNavy: "#0F2742",
    headerNavyText: "#FFFFFF",
    primaryBlue: "#1D4ED8",
    primaryBlueHover: "#1E40AF",
    primaryBlueText: "#FFFFFF",
    addToCartAmber: "#FFB400",
    addToCartAmberText: "#101828",
    buyNowOrange: "#C2410C",
    buyNowOrangeText: "#FFFFFF",
    successGreen: "#15803D",
    successGreenBg: "#DCFCE7",
    priceRed: "#B42318",
    warningText: "#92400E",
    warningBg: "#FEF3C7",
    admin: {
      bg: "#F5F6F7",
      surface: "#FFFFFF",
      text: "#101828",
      textMuted: "#475467",
      border: "#DDE1E6",
    },
  },
  typography: {
    fontFamily: {
      sans: ["var(--font-inter)", "system-ui", "-apple-system", "sans-serif"],
    },
    weights: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    baseSize: "16px",
    lineHeight: "1.5",
  },
  radius: {
    none: "0px",
    control: "4px",
    card: "8px",
  },
  spacing: {
    gridMax: "1280px",
    touchTargetMin: "44px",
  },
  motion: {
    durationFast: "150ms",
    durationBase: "200ms",
    durationSlow: "250ms",
    easing: "cubic-bezier(0.16, 1, 0.3, 1)",
  },
} as const;

export type DesignTokens = typeof designTokens;
