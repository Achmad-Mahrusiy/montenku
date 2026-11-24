import { z } from "zod";

const platformSchema = z.enum(["tiktok", "instagram", "youtube"], "Pilih platform");
export type Platform = z.infer<typeof platformSchema>;
export const platformLabels: Record<Platform, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };

// The six account colors from the Figma design (Montenku/Warna). Lowercase to match the DB check constraint.
const colorSchema = z.enum(["#e4572e", "#c2387a", "#2f6fdb", "#2e9e5b", "#12867f", "#c77700"], "Pilih warna");
export type AccountColor = z.infer<typeof colorSchema>;
export const colorLabels: Record<AccountColor, string> = {
  "#e4572e": "Merah bata",
  "#c2387a": "Magenta",
  "#2f6fdb": "Biru",
  "#2e9e5b": "Hijau",
  "#12867f": "Toska",
  "#c77700": "Kuning tua",
};
export const accountColors = colorSchema.options;

// Indonesian zones first, with the abbreviation people actually use.
export const indonesianTimezones: Record<string, string> = {
  "Asia/Jakarta": "Asia/Jakarta (WIB)",
  "Asia/Pontianak": "Asia/Pontianak (WIB)",
  "Asia/Makassar": "Asia/Makassar (WITA)",
  "Asia/Jayapura": "Asia/Jayapura (WIT)",
};
export const allTimezones = Intl.supportedValuesOf("timeZone");
export const timezoneLabel = (timezone: string) => indonesianTimezones[timezone] ?? timezone;
export const timezoneSchema = z.string().refine((value) => allTimezones.includes(value), "Zona waktu tidak dikenal");

export const contentAccountSchema = z.object({
  name: z.string().trim().min(1, "Nama akun wajib diisi").max(60, "Nama akun maksimal 60 karakter"),
  platform: platformSchema,
  // People paste "@handle"; store it without the @ and add it back when displaying.
  handle: z
    .string()
    .trim()
    .transform((value) => value.replace(/^@/, ""))
    .pipe(
      z
        .string()
        .min(1, "Handle wajib diisi")
        .max(100, "Handle maksimal 100 karakter")
        .regex(/^[A-Za-z0-9._-]+$/, "Handle hanya boleh berisi huruf, angka, titik, garis bawah, dan tanda hubung"),
    ),
  color: colorSchema,
  timezone: timezoneSchema,
});

export type ContentAccountInput = z.infer<typeof contentAccountSchema>;

export const contentAccountIdSchema = z.uuid();

// The .ics feed path segment (D-035): 32 random bytes in base64url is 43 characters, plus ".ics".
export const feedFileSchema = z.string().regex(/^[A-Za-z0-9_-]{43}\.ics$/);
export const feedUrl = (baseUrl: string, token: string) => `${baseUrl}/api/kalender/${token}.ics`;
