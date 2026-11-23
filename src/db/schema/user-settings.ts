import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, time, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

// One row per user, created on first save. No row = the defaults below (D-032).
export const userSettings = pgTable(
  "user_settings",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    emailEnabled: boolean("email_enabled").notNull().default(true),
    timezone: text("timezone").notNull().default("Asia/Jakarta"),
    // Both null = no quiet hours. start > end wraps past midnight (22:00 to 07:00).
    quietStart: time("quiet_start"),
    quietEnd: time("quiet_end"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("user_settings_quiet_pair", sql`(${t.quietStart} is null) = (${t.quietEnd} is null)`),
    check("user_settings_quiet_not_empty", sql`${t.quietStart} is distinct from ${t.quietEnd} or ${t.quietStart} is null`),
  ],
).enableRLS();
