import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const contentPlatform = pgEnum("content_platform", ["tiktok", "instagram", "youtube"]);

export const contentAccounts = pgTable(
  "content_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    platform: contentPlatform("platform").notNull(),
    handle: text("handle").notNull(),
    color: text("color").notNull(),
    timezone: text("timezone").notNull().default("Asia/Jakarta"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("content_accounts_user_id_idx").on(t.userId),
    // Target for composite foreign keys (account_id, user_id) in later tables, see DECISIONS.md D-008.
    unique("content_accounts_id_user_id_unique").on(t.id, t.userId),
    check("content_accounts_color_hex", sql`${t.color} ~ '^#[0-9a-f]{6}$'`),
  ],
).enableRLS();
