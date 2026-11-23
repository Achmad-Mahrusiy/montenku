import { env } from "@/lib/env";
import type { Email } from "@/server/dal/reminders";

// Sends one email through Resend's REST API (https://resend.com/docs/api-reference/emails/send-email).
// Plain fetch: one POST does not justify the SDK dependency.

/**
 * Resend keeps an Idempotency-Key for 24 hours: the same key with the same body is not sent again.
 * The same key with a different body (e.g. the item title changed between two attempts) answers
 * 409 invalid_idempotent_request: an email for this key was already accepted, so that counts as sent.
 */
export async function sendEmail(email: Email, idempotencyKey: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    // Fails on purpose so the reminder shows as failed, instead of pretending an email went out.
    throw new Error("RESEND_API_KEY belum diisi, email tidak dikirim");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text }),
  });
  if (response.ok) return;

  // The docs list error names but not the JSON field names, so look for the name in the raw body.
  const body = await response.text();
  if (response.status === 409 && body.includes("invalid_idempotent_request")) return;
  throw new Error(`Resend ${response.status}: ${body.slice(0, 300)}`);
}
