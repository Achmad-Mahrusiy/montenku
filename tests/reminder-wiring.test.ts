import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/reconcile/route";
import { closeDb } from "@/db";
import { sendEmail } from "@/server/mailer";
import { handleReminderMessage, retryDelay } from "@/server/reminder-jobs";

afterAll(() => closeDb());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const email = { to: "kamu@contoh.com", subject: "Pengingat: Resep (Masak Hemat)", text: "Isi" };

function stubFetch(status: number, body: string) {
  const fetchMock = vi.fn(async () => new Response(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("sendEmail (Resend)", () => {
  it("POST ke Resend dengan API key, Idempotency-Key, dan email teks", async () => {
    const fetchMock = stubFetch(200, '{"id":"abc"}');
    await sendEmail(email, "reminder:1:2026-11-25T10:00:00.000Z");
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer re_test_key",
        "Content-Type": "application/json",
        "Idempotency-Key": "reminder:1:2026-11-25T10:00:00.000Z",
      },
      body: JSON.stringify({ from: "Montenku <onboarding@resend.dev>", to: ["kamu@contoh.com"], subject: email.subject, text: "Isi" }),
    });
  });

  it("409 invalid_idempotent_request berarti email untuk kunci ini sudah diterima: dianggap terkirim", async () => {
    stubFetch(409, '{"name":"invalid_idempotent_request","message":"..."}');
    await expect(sendEmail(email, "k")).resolves.toBeUndefined();
  });

  it("error lain dilempar dengan pesan ringkas, supaya pengingat dicoba lagi lalu ditandai gagal", async () => {
    stubFetch(409, '{"message":"Another request is in progress.","name":"concurrent_idempotent_requests","statusCode":409}');
    await expect(sendEmail(email, "k")).rejects.toThrow("Resend 409 concurrent_idempotent_requests: Another request is in progress.");
    stubFetch(500, "Bad Gateway");
    await expect(sendEmail(email, "k")).rejects.toThrow("Resend 500 Bad Gateway");
  });

  it("tanpa RESEND_API_KEY: gagal dengan jelas, tidak pura-pura terkirim", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.resetModules();
    const { sendEmail: withoutKey } = await import("@/server/mailer");
    const fetchMock = stubFetch(200, "{}");
    await expect(withoutKey(email, "k")).rejects.toThrow("RESEND_API_KEY belum diisi");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("route cron /api/cron/reconcile", () => {
  const call = (authorization?: string) =>
    GET(new Request("http://localhost/api/cron/reconcile", { headers: authorization ? { authorization } : {} }));

  it("menolak tanpa atau dengan CRON_SECRET yang salah", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer salah")).status).toBe(401);
    expect((await call("test-cron-secret-0123456789")).status).toBe(401); // without "Bearer "
  });

  it("dengan CRON_SECRET yang benar menjalankan reconcile() dan mengembalikan ringkasannya", async () => {
    const response = await call("Bearer test-cron-secret-0123456789");
    expect(response.status).toBe(200);
    expect(Object.keys(await response.json()).sort()).toEqual(["cancelled", "delivered", "enqueued", "errors", "recovered", "upserted"]);
  });
});

describe("konsumen queue", () => {
  it("pesan rusak dibuang (di-ack) tanpa error; pesan untuk baris yang tidak ada jadi no-op", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(handleReminderMessage({ id: "bukan-uuid" })).resolves.toBeUndefined();
    await expect(handleReminderMessage(null)).resolves.toBeUndefined();
    await expect(handleReminderMessage({ id: randomUUID(), sendAt: "2026-11-25T10:00:00.000Z" })).resolves.toBeUndefined();
  });

  it("backoff 10, 20, 40 detik ... maksimal 5 menit, berhenti setelah 6 kali", () => {
    expect([1, 2, 3, 5].map(retryDelay)).toEqual([{ afterSeconds: 10 }, { afterSeconds: 20 }, { afterSeconds: 40 }, { afterSeconds: 160 }]);
    expect(retryDelay(6)).toEqual({ acknowledge: true });
  });
});
