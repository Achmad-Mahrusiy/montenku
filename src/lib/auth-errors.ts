import { isAPIError } from "better-auth/api";

const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Email atau kata sandi salah.",
  USER_ALREADY_EXISTS: "Email ini sudah terdaftar. Coba masuk.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Email ini sudah terdaftar. Coba masuk.",
  PASSWORD_TOO_SHORT: "Kata sandi minimal 8 karakter.",
  PASSWORD_TOO_LONG: "Kata sandi maksimal 128 karakter.",
  INVALID_EMAIL: "Format email belum benar.",
  INVALID_PASSWORD: "Kata sandi salah.",
};

// Better Auth errors are in English; show the user an Indonesian message and never the raw error.
export function toAuthErrorMessage(error: unknown): string {
  const code = isAPIError(error) ? error.body?.code : undefined;
  const message = code ? messages[code] : undefined;
  if (message) return message;
  // Unknown failure (database down, bug): log it on the server only. Drizzle errors carry the query
  // params (emails, password hashes), so log just the underlying cause.
  console.error(error instanceof Error && error.cause ? error.cause : error);
  return "Ada yang salah di server. Coba lagi sebentar lagi.";
}
