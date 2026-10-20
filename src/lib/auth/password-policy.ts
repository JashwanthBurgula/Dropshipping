/**
 * Curated list of commonly breached passwords and Indian/global keyboard patterns
 * that pass basic length checks but appear in public credential dumps.
 * This local layer is always checked synchronously on both client and server and fails closed.
 */
const BREACHED_PASSWORDS_SET = new Set([
  "password123",
  "password1234",
  "password12345",
  "1234567890",
  "12345678901",
  "qwertyuiop",
  "qwerty12345",
  "welcome1234",
  "welcome@123",
  "admin@12345",
  "india@12345",
  "indian@1234",
  "bengaluru123",
  "mumbai@1234",
  "letmein1234",
  "iloveyou123",
  "sunshine123",
  "trustno1234",
  "passw0rd123",
  "abc12345678",
  "changeme123",
  "football123",
  "kalaandkiln",
  "kalaandkiln123",
]);

/**
 * Synchronous local breached/weak password check (safe for both browser and server bundles).
 */
export function isBreachedOrWeakPassword(password: string): boolean {
  const normalized = password.trim().toLowerCase();
  if (BREACHED_PASSWORDS_SET.has(normalized)) {
    return true;
  }

  const stripped = normalized.replace(
    /[!@#$%^&*()_+=\-[\]{};':"\\|,.<>/?~`]+$/g,
    ""
  );
  if (BREACHED_PASSWORDS_SET.has(stripped)) {
    return true;
  }

  if (/(.)\1{4,}/.test(normalized)) {
    return true;
  }

  if (
    normalized.includes("12345678") ||
    normalized.includes("abcdefgh") ||
    normalized.includes("qwertyui")
  ) {
    return true;
  }

  return false;
}
