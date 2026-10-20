/**
 * Test Environment Isolation Guard
 *
 * Ensures automated tests NEVER run against a production or development database
 * or against Redis DB index 0.
 */
export function assertTestSafetyIsolation(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): void {
  const dbUrl = env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error(
      "FATAL TEST ISOLATION FAILURE: DATABASE_URL is not set. Tests refuse to run without a dedicated test database."
    );
  }

  let dbName = "";
  try {
    const parsed = new URL(dbUrl);
    dbName = parsed.pathname.replace(/^\//, "").trim();
  } catch {
    throw new Error(
      `FATAL TEST ISOLATION FAILURE: Could not parse DATABASE_URL "${dbUrl}". Database name must end with "_test".`
    );
  }

  if (!dbName.endsWith("_test")) {
    throw new Error(
      `FATAL TEST ISOLATION FAILURE: Tests refuse to run against database "${dbName}". Database name MUST end with "_test" (e.g. dropshipping_test). Current DATABASE_URL="${dbUrl}".`
    );
  }

  const redisUrl = env.REDIS_URL;
  if (!redisUrl) {
    throw new Error(
      "FATAL TEST ISOLATION FAILURE: REDIS_URL is not set. Tests refuse to run without a dedicated test Redis."
    );
  }

  let redisDbIndex = 0;
  try {
    const parsedRedis = new URL(redisUrl);
    const pathPart = parsedRedis.pathname.replace(/^\//, "").trim();
    redisDbIndex = pathPart ? parseInt(pathPart, 10) : 0;
  } catch {
    throw new Error(
      `FATAL TEST ISOLATION FAILURE: Could not parse REDIS_URL "${redisUrl}". Redis index must be > 0.`
    );
  }

  if (isNaN(redisDbIndex) || redisDbIndex <= 0) {
    throw new Error(
      `FATAL TEST ISOLATION FAILURE: Tests refuse to run against Redis DB index 0 (REDIS_URL="${redisUrl}"). Tests must use Redis index > 0 (e.g. redis://localhost:6379/1).`
    );
  }
}
