import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "media",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "var(--color-paper)",
        sand: "var(--color-sand)",
        ink: {
          DEFAULT: "var(--color-ink)",
          muted: "var(--color-ink-muted)",
        },
        stone: "var(--color-stone)",
        clay: {
          DEFAULT: "var(--color-clay)",
          hover: "var(--color-clay-hover)",
          text: "var(--color-clay-text)",
        },
        moss: "var(--color-moss)",
        amber: {
          DEFAULT: "var(--color-amber)",
          text: "var(--color-amber-text)",
        },
        brick: "var(--color-brick)",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        none: "0px",
        control: "4px",
        card: "8px",
      },
      maxWidth: {
        content: "1200px",
      },
      boxShadow: {
        floating: "0 8px 24px -4px rgba(29, 27, 24, 0.12)",
      },
      transitionDuration: {
        fast: "150ms",
        base: "200ms",
        slow: "250ms",
      },
      transitionTimingFunction: {
        editorial: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
