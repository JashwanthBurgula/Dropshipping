import Redis from "ioredis";

interface MemoryEntry {
  value: string;
  expiresAt: number | null;
}

class FallbackMemoryKv {
  private store = new Map<string, MemoryEntry>();
  private sets = new Map<string, Set<string>>();

  private isExpired(entry: MemoryEntry): boolean {
    return entry.expiresAt !== null && Date.now() > entry.expiresAt;
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async setEx(key: string, seconds: number, value: string): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + seconds * 1000,
    });
  }

  async setNxEx(key: string, seconds: number, value: string): Promise<boolean> {
    const existing = this.store.get(key);
    if (existing && !this.isExpired(existing)) {
      return false;
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + seconds * 1000,
    });
    return true;
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
    this.sets.delete(key);
  }

  async incrWithTtl(
    key: string,
    windowSeconds: number
  ): Promise<{ count: number; ttlSeconds: number }> {
    const existing = this.store.get(key);
    const now = Date.now();
    if (!existing || this.isExpired(existing)) {
      const expiresAt = now + windowSeconds * 1000;
      this.store.set(key, { value: "1", expiresAt });
      return { count: 1, ttlSeconds: windowSeconds };
    }
    const nextCount = Number(existing.value) + 1;
    existing.value = String(nextCount);
    const remainingMs = Math.max(1000, (existing.expiresAt ?? now) - now);
    return { count: nextCount, ttlSeconds: Math.ceil(remainingMs / 1000) };
  }

  async sadd(setKey: string, member: string): Promise<void> {
    let set = this.sets.get(setKey);
    if (!set) {
      set = new Set<string>();
      this.sets.set(setKey, set);
    }
    set.add(member);
  }

  async smembers(setKey: string): Promise<string[]> {
    const set = this.sets.get(setKey);
    return set ? Array.from(set) : [];
  }

  async srem(setKey: string, member: string): Promise<void> {
    const set = this.sets.get(setKey);
    if (set) {
      set.delete(member);
    }
  }

  clearAll(): void {
    this.store.clear();
    this.sets.clear();
  }
}

const memoryKv = new FallbackMemoryKv();

let redisInstance: Redis | null = null;
let redisConnectionFailed = false;

export function isFallbackAllowedEnvironment(
  nodeEnv: string | undefined = process.env.NODE_ENV
): boolean {
  return nodeEnv === "development" || nodeEnv === "test";
}

function assertProductionRedisConfigured(): void {
  if (!isFallbackAllowedEnvironment()) {
    if (!process.env.REDIS_URL) {
      throw new Error(
        "FATAL: REDIS_URL is missing in production. In-memory session/rate-limit fallback is strictly disabled outside development and test."
      );
    }
  }
}

function getRedisClient(): Redis | null {
  assertProductionRedisConfigured();

  if (process.env.USE_MEMORY_KV === "true" && isFallbackAllowedEnvironment()) {
    return null;
  }

  if (redisInstance) {
    return redisConnectionFailed && isFallbackAllowedEnvironment()
      ? null
      : redisInstance;
  }

  const url = process.env.REDIS_URL;
  if (!url) {
    if (!isFallbackAllowedEnvironment()) {
      throw new Error("FATAL: REDIS_URL is required in production.");
    }
    return null;
  }

  redisInstance = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: true,
    connectTimeout: 1500,
    retryStrategy(times) {
      if (times > 1 && isFallbackAllowedEnvironment()) {
        redisConnectionFailed = true;
        return null;
      }
      return Math.min(times * 100, 1000);
    },
  });

  redisInstance.on("ready", () => {
    redisConnectionFailed = false;
  });

  redisInstance.on("error", () => {
    if (isFallbackAllowedEnvironment()) {
      redisConnectionFailed = true;
    }
  });

  return redisInstance;
}

function handleRedisUnavailable(err?: unknown): void {
  if (!isFallbackAllowedEnvironment()) {
    const detail = err instanceof Error ? err.message : "Connection unavailable";
    throw new Error(
      `FATAL: Redis is required in production and failed closed (${detail}).`
    );
  }
  redisConnectionFailed = true;
}

export const kvStore = {
  async ping(): Promise<string> {
    const client = getRedisClient();
    if (client) {
      return await client.ping();
    }
    return "PONG_MEMORY";
  },

  async get(key: string): Promise<string | null> {
    const client = getRedisClient();
    if (client) {
      try {
        return await client.get(key);
      } catch (err) {
        handleRedisUnavailable(err);
      }
    }
    if (!isFallbackAllowedEnvironment()) {
      handleRedisUnavailable();
    }
    return memoryKv.get(key);
  },

  async setEx(key: string, seconds: number, value: string): Promise<void> {
    const client = getRedisClient();
    if (client) {
      try {
        await client.set(key, value, "EX", seconds);
        return;
      } catch (err) {
        handleRedisUnavailable(err);
      }
    }
    if (!isFallbackAllowedEnvironment()) {
      handleRedisUnavailable();
    }
    await memoryKv.setEx(key, seconds, value);
  },

  /**
   * Atomic SET if Not eXists with expiry in seconds (used for TOTP replay protection and cooldowns).
   */
  async setNxEx(key: string, seconds: number, value: string): Promise<boolean> {
    const client = getRedisClient();
    if (client) {
      try {
        const res = await client.set(key, value, "EX", seconds, "NX");
        return res === "OK";
      } catch (err) {
        handleRedisUnavailable(err);
      }
    }
    if (!isFallbackAllowedEnvironment()) {
      handleRedisUnavailable();
    }
    return memoryKv.setNxEx(key, seconds, value);
  },

  async del(key: string): Promise<void> {
    const client = getRedisClient();
    if (client) {
      try {
        await client.del(key);
      } catch (err) {
        handleRedisUnavailable(err);
      }
    } else if (!isFallbackAllowedEnvironment()) {
      handleRedisUnavailable();
    }
    await memoryKv.del(key);
  },

  async incrWithTtl(
    key: string,
    windowSeconds: number
  ): Promise<{ count: number; ttlSeconds: number }> {
    const client = getRedisClient();
    if (client) {
      try {
        const count = await client.incr(key);
        if (count === 1) {
          await client.expire(key, windowSeconds);
          return { count, ttlSeconds: windowSeconds };
        }
        const ttl = await client.ttl(key);
        return { count, ttlSeconds: ttl > 0 ? ttl : windowSeconds };
      } catch (err) {
        handleRedisUnavailable(err);
      }
    }
    if (!isFallbackAllowedEnvironment()) {
      handleRedisUnavailable();
    }
    return memoryKv.incrWithTtl(key, windowSeconds);
  },

  async ttl(key: string): Promise<number> {
    const client = getRedisClient();
    if (client) {
      try {
        return await client.ttl(key);
      } catch (err) {
        handleRedisUnavailable(err);
      }
    }
    return -1;
  },

  async sadd(setKey: string, member: string): Promise<void> {
    const client = getRedisClient();
    if (client) {
      try {
        await client.sadd(setKey, member);
        return;
      } catch (err) {
        handleRedisUnavailable(err);
      }
    }
    if (!isFallbackAllowedEnvironment()) {
      handleRedisUnavailable();
    }
    await memoryKv.sadd(setKey, member);
  },

  async smembers(setKey: string): Promise<string[]> {
    const client = getRedisClient();
    if (client) {
      try {
        return await client.smembers(setKey);
      } catch (err) {
        handleRedisUnavailable(err);
      }
    }
    if (!isFallbackAllowedEnvironment()) {
      handleRedisUnavailable();
    }
    return memoryKv.smembers(setKey);
  },

  async srem(setKey: string, member: string): Promise<void> {
    const client = getRedisClient();
    if (client) {
      try {
        await client.srem(setKey, member);
        return;
      } catch (err) {
        handleRedisUnavailable(err);
      }
    }
    if (!isFallbackAllowedEnvironment()) {
      handleRedisUnavailable();
    }
    await memoryKv.srem(setKey, member);
  },

  clearMemoryForTests(): void {
    memoryKv.clearAll();
  },

  async flushForTests(): Promise<void> {
    memoryKv.clearAll();
    const client = getRedisClient();
    if (client && isFallbackAllowedEnvironment()) {
      try {
        await client.flushdb();
      } catch {
        // Ignore if Redis is unreachable in local offline fallback
      }
    }
  },
};
