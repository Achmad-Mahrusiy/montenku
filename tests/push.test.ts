import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const target = { endpoint: "https://fcm.googleapis.com/fcm/send/rahasia-perangkat", p256dh: "kunci", auth: "auth" };
const message = { title: "Pengingat: Resep (Masak Hemat)", body: "2 jam sebelum · Rabu", url: "https://montenku.test/konten/1", tag: "reminder-1-once" };
const options = { ttlSeconds: 7200, topic: "0123456789abcdef0123456789abcdef" };

/** push.ts reads the VAPID keys once at import, so each case loads a fresh copy (and a fresh web-push to spy on). */
async function load(withKeys: boolean) {
  vi.stubEnv("VAPID_PUBLIC_KEY", withKeys ? "kunci-publik" : "");
  vi.stubEnv("VAPID_PRIVATE_KEY", withKeys ? "kunci-privat" : "");
  vi.stubEnv("VAPID_SUBJECT", withKeys ? "mailto:kamu@contoh.com" : "");
  vi.resetModules();
  const webpush = await import("web-push");
  const { sendPush } = await import("@/server/push");
  const spy = vi.spyOn(webpush.default, "sendNotification");
  return { sendPush, spy, WebPushError: webpush.WebPushError };
}

describe("sendPush (web-push)", () => {
  it("mengirim payload JSON dengan VAPID, TTL, topic, dan urgensi tinggi", async () => {
    const { sendPush, spy } = await load(true);
    spy.mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    expect(await sendPush(target, message, options)).toBe("ok");
    expect(spy).toHaveBeenCalledWith({ endpoint: target.endpoint, keys: { p256dh: "kunci", auth: "auth" } }, JSON.stringify(message), {
      vapidDetails: { subject: "mailto:kamu@contoh.com", publicKey: "kunci-publik", privateKey: "kunci-privat" },
      TTL: 7200,
      topic: options.topic,
      urgency: "high",
      timeout: 10_000,
    });
  });

  it("404 dan 410: perangkat sudah tidak ada ('gone'), supaya langganannya dihapus", async () => {
    const { sendPush, spy, WebPushError } = await load(true);
    for (const status of [404, 410]) {
      spy.mockRejectedValueOnce(new WebPushError("Received unexpected response code", status, {}, "gone", target.endpoint));
      expect(await sendPush(target, message, options)).toBe("gone");
    }
  });

  it("error lain dilempar dengan status dan isi singkat, tanpa endpoint perangkat", async () => {
    const { sendPush, spy, WebPushError } = await load(true);
    spy.mockRejectedValueOnce(new WebPushError("Received unexpected response code", 500, {}, "Server sibuk", target.endpoint));
    const error = await sendPush(target, message, options).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Push 500 Server sibuk");
    expect((error as Error).message).not.toContain("rahasia-perangkat");
  });

  it("tanpa kunci VAPID: gagal dengan jelas, tidak pura-pura terkirim", async () => {
    const { sendPush, spy } = await load(false);
    await expect(sendPush(target, message, options)).rejects.toThrow("VAPID belum diisi");
    expect(spy).not.toHaveBeenCalled();
  });
});
