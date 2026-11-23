import { z } from "zod";
import type { QuietHours } from "@/lib/time";
import { timezoneSchema } from "@/lib/validation/content-account";

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export type UserSettings = { emailEnabled: boolean; timezone: string; quiet: QuietHours | null };

// The settings form posts strings; times are only checked when quiet hours are switched on.
export const userSettingsSchema = z
  .object({
    emailEnabled: z.boolean(),
    timezone: timezoneSchema,
    quietEnabled: z.boolean(),
    quietStart: z.string(),
    quietEnd: z.string(),
  })
  .superRefine((v, ctx) => {
    if (!v.quietEnabled) return;
    if (!HH_MM.test(v.quietStart)) ctx.addIssue({ code: "custom", path: ["quietStart"], message: "Isi jam mulai, misalnya 22:00" });
    if (!HH_MM.test(v.quietEnd)) ctx.addIssue({ code: "custom", path: ["quietEnd"], message: "Isi jam selesai, misalnya 07:00" });
    else if (v.quietStart === v.quietEnd) ctx.addIssue({ code: "custom", path: ["quietEnd"], message: "Jam selesai harus berbeda dari jam mulai" });
  })
  .transform(
    (v): UserSettings => ({
      emailEnabled: v.emailEnabled,
      timezone: v.timezone,
      quiet: v.quietEnabled ? { start: v.quietStart, end: v.quietEnd } : null,
    }),
  );
