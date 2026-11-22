import { afterEach, describe, expect, it, vi } from "vitest";
import { checkLimit, emailKey, firstLimitError, type Limiter } from "@/server/rate-limit";

// A stand-in for Upstash: answers like Ratelimit.limit() without a network call.
function fakeLimiter(result: { success: boolean; resetInMs?: number } | Error): Limiter & { calls: string[] } {
  const calls: string[] = [];
  const limiter = {
    calls,
    async limit(key: string) {
      calls.push(key);
      if (result instanceof Error) throw result;
      return { success: result.success, reset: Date.now() + (result.resetInMs ?? 0), limit: 5, remaining: 0, pending: Promise.resolve() };
    },
  };
  return limiter as unknown as Limiter & { calls: string[] };
}

afterEach(() => vi.restoreAllMocks());

describe("checkLimit", () => {
  it("mengizinkan saat masih di bawah batas", async () => {
    expect(await checkLimit(fakeLimiter({ success: true }), "k")).toBeNull();
  });

  it("menolak dengan pesan berisi sisa menit, dibulatkan ke atas", async () => {
    expect(await checkLimit(fakeLimiter({ success: false, resetInMs: 90_000 }), "k")).toBe(
      "Terlalu banyak percobaan. Coba lagi dalam 2 menit.",
    );
    expect(await checkLimit(fakeLimiter({ success: false, resetInMs: 5_000 }), "k")).toBe(
      "Terlalu banyak percobaan. Coba lagi dalam 1 menit.",
    );
  });

  it("mengizinkan saat Upstash belum diatur (dev lokal)", async () => {
    expect(await checkLimit(null, "k")).toBeNull();
  });

  it("mengizinkan dan mencatat log saat Upstash error, supaya login tidak ikut mati", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await checkLimit(fakeLimiter(new Error("network")), "k")).toBeNull();
    expect(log).toHaveBeenCalledOnce();
  });
});

describe("firstLimitError", () => {
  it("berhenti di batas pertama yang terlampaui", async () => {
    const byIp = fakeLimiter({ success: false, resetInMs: 60_000 });
    const byEmail = fakeLimiter({ success: true });
    expect(await firstLimitError([[byIp, "ip"], [byEmail, "email"]])).toMatch(/Terlalu banyak percobaan/);
    expect(byEmail.calls).toEqual([]);
  });
});

describe("emailKey", () => {
  it("menyimpan hash, bukan email, dan tidak peka huruf besar atau spasi", () => {
    expect(emailKey(" A@Contoh.com ")).toBe(emailKey("a@contoh.com"));
    expect(emailKey("a@contoh.com")).toMatch(/^[0-9a-f]{64}$/);
    expect(emailKey("a@contoh.com")).not.toContain("contoh");
  });
});
