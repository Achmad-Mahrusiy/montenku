import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import type { QuietHours } from "@/lib/time";
import type { UserSettings } from "@/lib/validation/user-settings";

export const DEFAULT_SETTINGS: UserSettings = { emailEnabled: true, timezone: "Asia/Jakarta", quiet: null };

/** Postgres `time` comes back as "22:00:00"; the app works with "22:00". */
export function quietFromRow(start: string | null, end: string | null): QuietHours | null {
  return start && end ? { start: start.slice(0, 5), end: end.slice(0, 5) } : null;
}

/** A user who never saved settings has no row and gets the defaults. */
export async function getUserSettings(userId: string): Promise<UserSettings> {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  if (!row) return DEFAULT_SETTINGS;
  return { emailEnabled: row.emailEnabled, timezone: row.timezone, quiet: quietFromRow(row.quietStart, row.quietEnd) };
}

export async function saveUserSettings(userId: string, settings: UserSettings): Promise<void> {
  const values = {
    emailEnabled: settings.emailEnabled,
    timezone: settings.timezone,
    quietStart: settings.quiet?.start ?? null,
    quietEnd: settings.quiet?.end ?? null,
  };
  await db.insert(userSettings).values({ userId, ...values }).onConflictDoUpdate({ target: userSettings.userId, set: values });
}
