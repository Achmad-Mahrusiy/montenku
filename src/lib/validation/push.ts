import { z } from "zod";

// A push subscription comes from the browser, and our server later POSTs to its endpoint. Without a check anyone could
// make the server send requests to any address (SSRF), so only the browsers' own push services are accepted (D-037).
// Hosts from each vendor's docs (checked 24 Nov 2026): Chrome and other Chromium browsers use Firebase Cloud Messaging,
// Firefox uses Mozilla autopush, Safari uses Apple (any subdomain of push.apple.com), Edge uses Windows Push (WNS).
const exactHosts = ["fcm.googleapis.com", "updates.push.services.mozilla.com"];
const hostSuffixes = [".push.apple.com", ".notify.windows.com"];

export function isPushServiceUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  // https only, default port, no user:password@ trick.
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return false;
  const host = url.hostname;
  return exactHosts.includes(host) || hostSuffixes.some((suffix) => host.endsWith(suffix));
}

const endpoint = z.string().max(2048).refine(isPushServiceUrl, "Layanan push browser ini belum didukung.");
// Browser keys in base64url: p256dh is a 65-byte public key (87 characters), auth a 16-byte secret (22 characters).
// Some browsers add "=" padding, so allow a little room.
const base64url = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+=*$/);

/** The shape of PushSubscription.toJSON() from the browser, flattened for the database. */
export const pushSubscriptionSchema = z
  .object({ endpoint, keys: z.object({ p256dh: base64url(87, 90), auth: base64url(22, 24) }) })
  .transform((s) => ({ endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth }));

export const pushEndpointSchema = endpoint;
