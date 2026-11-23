import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { contentItems } from "./content-items";
import { schedules } from "./schedules";

// "Remind me 2 hours before" on one item, or on every occurrence of a recurring schedule. Exactly one target.
export const reminderSettings = pgTable(
  "reminder_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    itemId: uuid("item_id"),
    scheduleId: uuid("schedule_id"),
    offsetMinutes: integer("offset_minutes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "reminder_settings_item_owner_fk", columns: [t.itemId, t.userId], foreignColumns: [contentItems.id, contentItems.userId] }).onDelete(
      "cascade",
    ),
    foreignKey({
      name: "reminder_settings_schedule_owner_fk",
      columns: [t.scheduleId, t.userId],
      foreignColumns: [schedules.id, schedules.userId],
    }).onDelete("cascade"),
    check("reminder_settings_one_target", sql`(${t.itemId} is null) <> (${t.scheduleId} is null)`),
    // Up to 7 days before; the queue cannot hold a message longer (D-005).
    check("reminder_settings_offset_range", sql`${t.offsetMinutes} between 0 and 10080`),
    // The same offset twice on one target would send the same email twice.
    unique("reminder_settings_item_offset_unique").on(t.itemId, t.offsetMinutes),
    unique("reminder_settings_schedule_offset_unique").on(t.scheduleId, t.offsetMinutes),
    unique("reminder_settings_id_user_id_unique").on(t.id, t.userId),
  ],
).enableRLS();

// D-007: pending -> sending (claimed, with a lease) -> sent; or cancelled; or failed after 5 attempts.
export const reminderStatus = pgEnum("reminder_status", ["pending", "sending", "sent", "cancelled", "failed"]);

// One email to send: the source of truth (D-006). Rows exist only for the next 48 hours of send_at (D-005).
export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    reminderSettingId: uuid("reminder_setting_id").notNull(),
    // Wall-clock key of the occurrence for a schedule (D-004), or "once" for a single item.
    occurrenceKey: text("occurrence_key").notNull(),
    targetAt: timestamp("target_at", { withTimezone: true }).notNull(),
    sendAt: timestamp("send_at", { withTimezone: true }).notNull(),
    status: reminderStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    // send_at that was last put on the queue; null or different = still to enqueue (the table is the outbox).
    enqueuedSendAt: timestamp("enqueued_send_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      name: "reminders_setting_owner_fk",
      columns: [t.reminderSettingId, t.userId],
      foreignColumns: [reminderSettings.id, reminderSettings.userId],
    }).onDelete("cascade"),
    // The database-side idempotency key (D-006): one row per setting and occurrence.
    unique("reminders_setting_occurrence_unique").on(t.reminderSettingId, t.occurrenceKey),
    index("reminders_status_send_at_idx").on(t.status, t.sendAt),
  ],
).enableRLS();
