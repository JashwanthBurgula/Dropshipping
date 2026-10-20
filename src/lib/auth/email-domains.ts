/**
 * Email Normalisation & Domain Restriction Policy
 *
 * Implements:
 * 1. Gmail canonicalisation (removes dots from localpart, drops +alias suffix, unifies googlemail.com to gmail.com).
 * 2. Allowed domain enforcement (configurable via ALLOWED_EMAIL_DOMAINS, defaults to gmail.com, googlemail.com).
 */

export const DEFAULT_ALLOWED_EMAIL_DOMAINS = ["gmail.com", "googlemail.com"];

export const USER_FACING_DOMAIN_NOT_ALLOWED_MESSAGE =
  "Only Google email accounts (@gmail.com, @googlemail.com) are currently accepted for customer registration. Please use a Gmail address.";

/**
 * Normalises an email address for uniqueness:
 * - Lowercase and trim.
 * - For gmail.com and googlemail.com: remove dots in local part, drop anything after '+', normalize domain to gmail.com.
 * - For other domains: lowercase and trim.
 */
export function canonicalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex <= 0) return trimmed;
  let localPart = trimmed.slice(0, atIndex);
  let domain = trimmed.slice(atIndex + 1);

  if (domain === "gmail.com" || domain === "googlemail.com") {
    domain = "gmail.com";
    localPart = localPart.split("+")[0] ?? "";
    localPart = localPart.replace(/\./g, "");
  }

  return `${localPart}@${domain}`;
}

/**
 * Returns the list of permitted email domains from ALLOWED_EMAIL_DOMAINS.
 * Defaults to ["gmail.com", "googlemail.com"].
 */
export function getAllowedEmailDomains(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const raw = env.ALLOWED_EMAIL_DOMAINS ?? "gmail.com,googlemail.com";
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Validates whether an email domain is in the permitted domain list.
 */
export function isEmailDomainAllowed(
  email: string,
  env: NodeJS.ProcessEnv = process.env
): { allowed: boolean; domain: string; allowedDomains: string[] } {
  const allowed = getAllowedEmailDomains(env);
  if (allowed.includes("*")) {
    return { allowed: true, domain: "*", allowedDomains: allowed };
  }
  const atIndex = email.lastIndexOf("@");
  if (atIndex <= 0) {
    return { allowed: false, domain: "", allowedDomains: allowed };
  }
  const domain = email.slice(atIndex + 1).trim().toLowerCase();
  return {
    allowed: allowed.includes(domain),
    domain,
    allowedDomains: allowed,
  };
}
