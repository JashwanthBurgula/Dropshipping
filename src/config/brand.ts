/**
 * Single source of truth for brand identity, legal contact details, and regional tax defaults.
 *
 * IMPORTANT: The Grievance Officer, Registered Address, and GSTIN values below are
 * explicitly marked with "PLACEHOLDER_" until legal/accounting sign-off.
 * `assertNoPlaceholdersInProduction()` fails the production build if any "PLACEHOLDER_"
 * value remains unreplaced in production.
 */
export const brandConfig = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "Kala & Kiln",
  legalEntityName:
    process.env.LEGAL_ENTITY_NAME ?? "Kala & Kiln Retail Pvt. Ltd.",
  packageSlug: "kala-and-kiln",
  tagline: "Home, Kitchen & Utility Goods Delivered Across India",
  domain: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supportEmail:
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@kalaandkiln.in",
  grievanceEmail:
    process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL ?? "grievance@kalaandkiln.in",
  grievanceOfficerName:
    process.env.GRIEVANCE_OFFICER_NAME ??
    "PLACEHOLDER_GRIEVANCE_OFFICER_REPLACE_BEFORE_LAUNCH",
  registeredAddress:
    process.env.REGISTERED_OFFICE_ADDRESS ??
    "PLACEHOLDER_REGISTERED_ADDRESS_REPLACE_BEFORE_LAUNCH",
  sellerStateCode: process.env.SELLER_STATE_CODE ?? "KA",
  sellerStateName: process.env.SELLER_STATE_NAME ?? "Karnataka",
  gstinPlaceholder:
    process.env.SELLER_GSTIN ?? "PLACEHOLDER_GSTIN_29AABCK0000X1Z5",
  adminPortalPath: process.env.ADMIN_PORTAL_PATH ?? "/ops-portal",
  privacyPolicyVersion: "2026-10-10.v1",
  freeShippingThresholdPaise: 99900,
  codNewAccountMaxPaise: 500000,
  codStandardMaxPaise: 1500000,
  categories: [
    { slug: "tableware-ceramics", name: "Tableware & Ceramics" },
    { slug: "linen-textiles", name: "Linen & Textiles" },
    { slug: "brass-metalwork", name: "Brass & Metalwork" },
    { slug: "lighting-glass", name: "Lighting & Glass" },
  ],
} as const;

export type BrandConfig = typeof brandConfig;

export const DEPLOYMENT_PLATFORM_ENV_VARS = [
  "VERCEL",
  "VERCEL_ENV",
  "CF_PAGES",
  "RAILWAY_ENVIRONMENT",
  "RENDER",
  "FLY_APP_NAME",
  "AWS_EXECUTION_ENV",
  "K_SERVICE",
  "HEROKU_APP_ID",
  "NETLIFY",
  "DO_APP_PLATFORM",
  "CI_DEPLOYMENT",
] as const;

export type DeploymentTargetMode =
  | "development"
  | "local-preview"
  | "production";

export const REQUIRED_LEGAL_COMPLIANCE_FIELDS = [
  {
    key: "grievanceOfficerName",
    envVar: "GRIEVANCE_OFFICER_NAME",
    label: "Grievance Officer Name",
  },
  {
    key: "registeredAddress",
    envVar: "REGISTERED_OFFICE_ADDRESS",
    label: "Registered Office Address",
  },
  {
    key: "gstinPlaceholder",
    envVar: "SELLER_GSTIN",
    label: "Seller GSTIN",
  },
] as const;

/**
 * Returns true if the value is missing, empty, or contains a placeholder/unconfigured marker.
 */
export function isPlaceholderOrUnconfiguredLegalValue(value: unknown): boolean {
  if (typeof value !== "string") {
    return true;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return true;
  }
  return /PLACEHOLDER_|REPLACE_BEFORE_LAUNCH|UNCONFIGURED/i.test(trimmed);
}

export interface UnconfiguredLegalFieldReport {
  key: string;
  envVar: string;
  label: string;
  currentValue: string;
}

/**
 * Lists required legal/compliance fields that are currently missing or still set to placeholders.
 */
export function getUnconfiguredLegalFields(
  configToCheck: Record<string, unknown> = brandConfig
): UnconfiguredLegalFieldReport[] {
  const unconfigured: UnconfiguredLegalFieldReport[] = [];

  for (const field of REQUIRED_LEGAL_COMPLIANCE_FIELDS) {
    const rawVal = configToCheck[field.key];
    if (isPlaceholderOrUnconfiguredLegalValue(rawVal)) {
      unconfigured.push({
        key: field.key,
        envVar: field.envVar,
        label: field.label,
        currentValue:
          typeof rawVal === "string" && rawVal.trim().length > 0
            ? rawVal.trim()
            : "<missing>",
      });
    }
  }

  return unconfigured;
}

export interface FormattedLegalField {
  isConfigured: boolean;
  displayText: string;
  rawValue: string;
}

/**
 * Formats a legal compliance field for UI rendering so unconfigured placeholder values
 * are explicitly labeled as unconfigured and never represented as verified legal information.
 */
export function getLegalFieldDisplay(
  rawValue: string | undefined | null,
  envVarName:
    | "GRIEVANCE_OFFICER_NAME"
    | "REGISTERED_OFFICE_ADDRESS"
    | "SELLER_GSTIN"
): FormattedLegalField {
  const trimmed = typeof rawValue === "string" ? rawValue.trim() : "";
  if (isPlaceholderOrUnconfiguredLegalValue(trimmed)) {
    return {
      isConfigured: false,
      displayText: `Unconfigured (${envVarName} not set - local preview placeholder)`,
      rawValue: trimmed || `UNCONFIGURED_${envVarName}`,
    };
  }
  return {
    isConfigured: true,
    displayText: trimmed,
    rawValue: trimmed,
  };
}

/**
 * Returns true if the process is running on a managed cloud or CI deployment platform.
 */
export function isDeploymentPlatformEnvironment(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return DEPLOYMENT_PLATFORM_ENV_VARS.some((key) => {
    const val = env[key];
    return (
      typeof val === "string" &&
      val.trim() !== "" &&
      val !== "0" &&
      val !== "false"
    );
  });
}

/**
 * Returns true only when NEXT_PUBLIC_APP_URL is unset or points to a local loopback/dev host.
 * Any public production domain returns false so local-preview flags cannot disable compliance
 * when building for a real domain.
 */
export function isLocalhostAppUrl(appUrl: string | undefined): boolean {
  if (!appUrl || appUrl.trim() === "") {
    return true;
  }
  try {
    const parsed = new URL(appUrl.trim());
    const host = parsed.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local")
    );
  } catch {
    return false;
  }
}

/**
 * Resolves the explicit build/runtime deployment mode without relying on NODE_ENV alone:
 * - Next.js forces `NODE_ENV="production"` during `next build` even on local workstations.
 * - Any deployment platform environment variable, `DEPLOYMENT_TARGET="production"`, or a
 *   non-localhost `NEXT_PUBLIC_APP_URL` unconditionally locks the build into `"production"`
 *   mode and ignores local preview flags.
 * - Local workstation builds (`http://localhost:3000`, no cloud platform env vars) can set
 *   `DEPLOYMENT_TARGET="local-preview"` (or legacy `ALLOW_PLACEHOLDER_BRAND_IN_BUILD="true"`)
 *   to verify builds locally while legal values are still placeholders.
 */
export function resolveBuildDeploymentMode(
  env: NodeJS.ProcessEnv = process.env
): DeploymentTargetMode {
  if (env.NODE_ENV !== "production") {
    return "development";
  }

  const rawTarget = (env.DEPLOYMENT_TARGET ?? "").trim().toLowerCase();

  // Hard production lock: explicit production target, managed deployment platform, or non-local URL
  if (
    rawTarget === "production" ||
    isDeploymentPlatformEnvironment(env) ||
    !isLocalhostAppUrl(env.NEXT_PUBLIC_APP_URL)
  ) {
    return "production";
  }

  // Explicit local preview build on a local machine
  if (
    rawTarget === "local-preview" ||
    env.ALLOW_PLACEHOLDER_BRAND_IN_BUILD === "true"
  ) {
    return "local-preview";
  }

  // Fail-closed default when NODE_ENV is production and no explicit local-preview mode is configured
  return "production";
}

/**
 * Determines whether placeholder or missing brand/legal values must fail the build.
 * Local preview settings (`DEPLOYMENT_TARGET="local-preview"` / `ALLOW_PLACEHOLDER_BRAND_IN_BUILD="true"`)
 * are strictly ignored when `DEPLOYMENT_TARGET="production"`, on any deployment platform, or
 * when `NEXT_PUBLIC_APP_URL` is a non-localhost domain.
 */
export function shouldEnforceProductionBrandPlaceholders(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return resolveBuildDeploymentMode(env) === "production";
}

/**
 * Verifies that all legal/compliance fields (`grievanceOfficerName`,
 * `registeredAddress`, `gstinPlaceholder`) are present, non-empty, and have had
 * all placeholder markers replaced with real business details before a production deployment.
 */
export function assertNoPlaceholdersInProduction(
  configToCheck: Record<string, unknown> = brandConfig,
  envOrNodeEnv: string | NodeJS.ProcessEnv | undefined = process.env.NODE_ENV
): void {
  if (typeof envOrNodeEnv === "string" || envOrNodeEnv === undefined) {
    if (envOrNodeEnv !== "production") {
      return;
    }
  } else {
    if (!shouldEnforceProductionBrandPlaceholders(envOrNodeEnv)) {
      return;
    }
  }

  const offendingEntries = new Set<string>();

  // 1. Check required statutory legal fields if present in configToCheck or if validating full brandConfig
  const hasAllRequiredKeys = REQUIRED_LEGAL_COMPLIANCE_FIELDS.every(
    (f) => f.key in configToCheck
  );
  const fieldsToVerify = hasAllRequiredKeys
    ? REQUIRED_LEGAL_COMPLIANCE_FIELDS.map((f) => f.key)
    : Object.keys(configToCheck);

  for (const key of fieldsToVerify) {
    const value = configToCheck[key];
    if (isPlaceholderOrUnconfiguredLegalValue(value)) {
      const formattedVal =
        typeof value === "string" && value.trim().length > 0
          ? `"${value}"`
          : "<missing/empty>";
      offendingEntries.add(`${key}=${formattedVal}`);
    }
  }

  // 2. Also scan any additional string fields on configToCheck for PLACEHOLDER_ markers
  for (const [key, value] of Object.entries(configToCheck)) {
    if (
      typeof value === "string" &&
      /PLACEHOLDER_|REPLACE_BEFORE_LAUNCH|UNCONFIGURED/i.test(value)
    ) {
      offendingEntries.add(`${key}="${value}"`);
    }
  }

  if (offendingEntries.size > 0) {
    throw new Error(
      `FATAL PRODUCTION COMPLIANCE CHECK: Replace placeholder brand/legal values before building for production: ${Array.from(
        offendingEntries
      ).join(", ")}`
    );
  }
}


