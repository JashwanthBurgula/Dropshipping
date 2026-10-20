import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) {
    if (key !== "NODE_ENV" && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:55432/dropshipping_test?schema=public";
  process.env.REDIS_URL =
    process.env.TEST_REDIS_URL ?? "redis://localhost:6379/1";

  return {
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
      setupFiles: ["tests/setup-env.ts"],
      globals: false,
      fileParallelism: false,
      env: {
        NODE_ENV: "test",
        EMAIL_PROVIDER: "console",
        DATABASE_URL:
          process.env.TEST_DATABASE_URL ??
          "postgresql://postgres:postgres@127.0.0.1:55432/dropshipping_test?schema=public",
        REDIS_URL:
          process.env.TEST_REDIS_URL ?? "redis://localhost:6379/1",
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
