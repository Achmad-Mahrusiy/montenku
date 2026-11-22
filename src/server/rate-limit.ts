import { createHash } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";
import { env } from "@/lib/env";

// Only the method we call, so tests can pass a fake limiter.
export type Limiter = Pick<Ratelimit, "limit">;

const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })
    : null;

if (!redis && process.env.NODE_ENV !== "test") {
  console.warn("Rate limit mati: UPSTASH_REDIS_REST_URL/TOKEN belum diisi di .env.");
}

function make(name: string, tokens: number, window: `${number} ${"s" | "m" | "h"}`): Limiter | null {
  if (!redis) return null;
  // timeout: if Upstash does not answer within 2s, the request is allowed (see checkLimit).
  return new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(tokens, window), prefix: `montenku:${name}`, timeout: 2000 });
}

export const limits = {
  // Per IP stops one machine trying many accounts; per email stops many machines guessing one password.
  signInByIp: make("sign-in:ip", 20, "15 m"),
  signInByEmail: make("sign-in:email", 5, "15 m"),
  signUpByIp: make("sign-up:ip", 5, "1 h"),
  accountWriteByUser: make("account-write:user", 30, "1 m"),
};

/**
 * Returns an Indonesian error message when the key is over its limit, otherwise null.
 * Fails open: if Redis is down we log and allow, so an Upstash outage does not lock everyone out of login.
 */
export async function checkLimit(limiter: Limiter | null, key: string): Promise<string | null> {
  if (!limiter) return null;
  try {
    const { success, reset } = await limiter.limit(key);
    if (success) return null;
    const minutes = Math.max(1, Math.ceil((reset - Date.now()) / 60_000));
    return `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.`;
  } catch (error) {
    console.error("Rate limit gagal dicek, permintaan diizinkan:", error);
    return null;
  }
}

// Emails are personal data; Redis only needs a stable key, so store a hash.
export const emailKey = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

// Vercel sets x-real-ip / x-forwarded-for itself and overwrites what the client sends.
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

// Runs several limits and returns the first message, so one call site covers e.g. IP and email.
export async function firstLimitError(checks: [Limiter | null, string][]): Promise<string | null> {
  for (const [limiter, key] of checks) {
    const message = await checkLimit(limiter, key);
    if (message) return message;
  }
  return null;
}
