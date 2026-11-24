import { describe, expect, it } from "vitest";
import { isPushServiceUrl, pushSubscriptionSchema } from "@/lib/validation/push";

// The server POSTs to whatever endpoint it stores, so only real browser push services pass (D-037, SSRF).
describe("alamat layanan push yang diterima", () => {
  it("menerima layanan push Chrome, Firefox, Safari, dan Edge", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
      "https://web.push.apple.com/QGuQyavXutnMei",
      "https://sg2p.notify.windows.com/w/?token=BQYAAA",
    ]) {
      expect(isPushServiceUrl(url), url).toBe(true);
    }
  });

  it("menolak host lain, trik nama host, http, port, kredensial, dan IP", () => {
    for (const url of [
      "https://evil.com/fcm/send/abc",
      "https://fcm.googleapis.com.evil.com/fcm/send/abc",
      "https://evil.com/?fcm.googleapis.com",
      "https://evilpush.apple.com/x",
      "https://push.apple.com.evil.com/x",
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/fcm/send/abc",
      "https://user:pass@fcm.googleapis.com/fcm/send/abc",
      "https://169.254.169.254/latest/meta-data",
      "https://127.0.0.1/x",
      "https://localhost/x",
      "bukan url",
    ]) {
      expect(isPushServiceUrl(url), url).toBe(false);
    }
  });

  it("skema langganan: bentuk PushSubscription.toJSON() diratakan, kunci diperiksa", () => {
    const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } };
    expect(pushSubscriptionSchema.parse({ ...subscription, expirationTime: null })).toEqual({
      endpoint: subscription.endpoint,
      p256dh: "B".repeat(87),
      auth: "a".repeat(22),
    });
    expect(pushSubscriptionSchema.safeParse({ ...subscription, endpoint: "https://evil.com/x" }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ ...subscription, keys: { p256dh: "B".repeat(87), auth: "a b" } }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ endpoint: subscription.endpoint }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse(null).success).toBe(false);
  });
});
