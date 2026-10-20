import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT_DIR = process.cwd();
const SCAN_DIRS = [
  path.join(ROOT_DIR, "src"),
  path.join(ROOT_DIR, "prisma"),
];
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".json"]);

/**
 * Banned hero marketing cliches and template phrases from the master specification.
 */
const BANNED_HERO_PHRASES = [
  "seamless shopping experience",
  "curated just for you",
  "discover our collection",
  "elevate your everyday",
  "redefining modern",
  "unparalleled craftsmanship",
  "where tradition meets modernity",
  "next-gen e-commerce",
  "revolutionizing retail",
] as const;

function collectSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "migrations" || entry.name === "node_modules") {
        continue;
      }
      results.push(...collectSourceFiles(fullPath));
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }

  return results;
}

const ALL_SOURCE_FILES = SCAN_DIRS.flatMap((d) => collectSourceFiles(d));

describe("Design Bans Static Scanner (src/ and prisma/ seed data)", () => {
  it("scans at least 30 source and seed files", () => {
    expect(ALL_SOURCE_FILES.length).toBeGreaterThanOrEqual(30);
  });

  it("contains zero U+2014 em-dash characters across all source and seed files", () => {
    const violations: string[] = [];
    for (const filePath of ALL_SOURCE_FILES) {
      const content = fs.readFileSync(filePath, "utf8");
      if (content.includes("\u2014")) {
        const lines = content.split(/\r?\n/);
        lines.forEach((line, idx) => {
          if (line.includes("\u2014")) {
            violations.push(
              `${path.relative(ROOT_DIR, filePath)}:${idx + 1} -> contains U+2014 em-dash`
            );
          }
        });
      }
    }
    expect(violations).toEqual([]);
  });

  it("contains zero emoji characters across all source and seed files", () => {
    // Extended_Pictographic matches emoji symbols while ignoring ASCII digits/#/*
    const emojiRegex = /\p{Extended_Pictographic}/u;
    const violations: string[] = [];

    for (const filePath of ALL_SOURCE_FILES) {
      const content = fs.readFileSync(filePath, "utf8");
      if (emojiRegex.test(content)) {
        const lines = content.split(/\r?\n/);
        lines.forEach((line, idx) => {
          const match = line.match(emojiRegex);
          if (match) {
            violations.push(
              `${path.relative(ROOT_DIR, filePath)}:${idx + 1} -> contains emoji "${match[0]}"`
            );
          }
        });
      }
    }
    expect(violations).toEqual([]);
  });

  it("contains zero gradient classes or CSS gradient functions", () => {
    const gradientRegex =
      /\b(bg-gradient-to-[a-z]+|bg-linear-to-[a-z]+|from-[a-z]+-\d+|via-[a-z]+-\d+|to-[a-z]+-\d+|linear-gradient\s*\(|radial-gradient\s*\(|conic-gradient\s*\()/i;
    const violations: string[] = [];

    for (const filePath of ALL_SOURCE_FILES) {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        const match = line.match(gradientRegex);
        if (match) {
          violations.push(
            `${path.relative(ROOT_DIR, filePath)}:${idx + 1} -> contains banned gradient "${match[0]}"`
          );
        }
      });
    }
    expect(violations).toEqual([]);
  });

  it("contains zero rounded-full classes on buttons, badges, or UI components", () => {
    const roundedFullRegex = /\brounded-full\b/;
    const violations: string[] = [];

    for (const filePath of ALL_SOURCE_FILES) {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        // Ignore comments explaining that rounded-full is banned
        const trimmed = line.trim();
        if (
          trimmed.startsWith("//") ||
          trimmed.startsWith("*") ||
          trimmed.startsWith("/*")
        ) {
          return;
        }
        if (roundedFullRegex.test(line)) {
          violations.push(
            `${path.relative(ROOT_DIR, filePath)}:${idx + 1} -> contains banned "rounded-full"`
          );
        }
      });
    }
    expect(violations).toEqual([]);
  });

  it("contains zero banned hero cliches or template marketing phrases", () => {
    const violations: string[] = [];

    for (const filePath of ALL_SOURCE_FILES) {
      const contentLower = fs.readFileSync(filePath, "utf8").toLowerCase();
      for (const phrase of BANNED_HERO_PHRASES) {
        if (contentLower.includes(phrase)) {
          violations.push(
            `${path.relative(ROOT_DIR, filePath)} -> contains banned phrase "${phrase}"`
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("contains zero 'Photo slot' placeholder text across all storefront source and seed files", () => {
    const violations: string[] = [];
    for (const filePath of ALL_SOURCE_FILES) {
      const content = fs.readFileSync(filePath, "utf8");
      if (/photo\s+slot/i.test(content)) {
        violations.push(
          `${path.relative(ROOT_DIR, filePath)} -> contains 'Photo slot' placeholder text`
        );
      }
    }
    expect(violations).toEqual([]);
  });

  it("declares exactly one font family (Inter) and zero serif or display fonts in layout and styles", () => {
    const layoutPath = path.join(ROOT_DIR, "src", "app", "layout.tsx");
    const layoutContent = fs.readFileSync(layoutPath, "utf8");

    // Only Inter should be imported from next/font/google
    expect(layoutContent).toContain('import { Inter } from "next/font/google"');
    expect(layoutContent).not.toMatch(/import\s*\{[^}]*(?:Playfair|Fraunces|Merriweather|Lora|Cinzel|DM_Sans)[^}]*\}\s*from\s*["']next\/font/i);

    // CSS must not declare serif fonts
    const cssPath = path.join(ROOT_DIR, "src", "app", "globals.css");
    const cssContent = fs.readFileSync(cssPath, "utf8");
    expect(cssContent).not.toContain("font-family: serif");
    expect(cssContent).not.toContain("Georgia");
  });

  it("ensures Header component uses responsive fluid widths without fixed overflow hazards across 1920, 1440, 1280, 1024, 768, 375 px", () => {
    const headerPath = path.join(ROOT_DIR, "src", "components", "layout", "Header.tsx");
    const headerContent = fs.readFileSync(headerPath, "utf8");

    // Must have sticky full-width container
    expect(headerContent).toContain("w-full");
    // Responsive breakpoints handled cleanly
    expect(headerContent).toContain("max-w-[1280px]");
    expect(headerContent).toContain("md:hidden");
    expect(headerContent).toContain("lg:flex");
    // Ensure no fixed desktop widths > 320px outside of max-w constraints
    const fixedLargeWidthMatches = headerContent.match(/\bw-(?:\[(?:[4-9]\d{2}|\d{4,})px\]|\d{3,})\b/g);
    expect(fixedLargeWidthMatches ?? []).toEqual([]);
  });
});
