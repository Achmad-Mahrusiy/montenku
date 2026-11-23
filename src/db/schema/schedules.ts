import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { contentAccounts } from "./content-accounts";

// A recurring posting rule, e.g. "every Tuesday and Friday at 19:00" (DECISIONS.md D-002, D-003).
// Occurrences are computed when needed; only exceptions and filled slots are stored.
export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull(),
    title: text("title").notNull(),
    // RRULE body without DTSTART and TZID, e.g. "FREQ=WEEKLY;BYDAY=TU,FR". UNTIL, when set, is wall-clock time.
    rrule: text("rrule").notNull(),
    // First occurrence as wall-clock time in the account's timezone (no zone stored on purpose: Q1 keeps 19:00 at 19:00).
    dtstartLocal: timestamp("dtstart_local", { mode: "string" }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      name: "schedules_account_owner_fk",
      columns: [t.accountId, t.userId],
      foreignColumns: [contentAccounts.id, contentAccounts.userId],
    }).onDelete("cascade"),
    unique("schedules_id_user_id_unique").on(t.id, t.userId),
    index("schedules_user_idx").on(t.userId),
  ],
).enableRLS();

export const exceptionKind = pgEnum("schedule_exception_kind", ["skip", "move"]);

// "Skip 1 Dec" or "move 4 Dec 19:00 to 5 Dec 10:00", keyed by the occurrence's original wall-clock time (D-004).
export const scheduleExceptions = pgTable(
  "schedule_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    scheduleId: uuid("schedule_id").notNull(),
    occurrenceKey: text("occurrence_key").notNull(),
    kind: exceptionKind("kind").notNull(),
    movedToLocal: timestamp("moved_to_local", { mode: "string" }),
  },
  (t) => [
    foreignKey({
      name: "schedule_exceptions_schedule_owner_fk",
      columns: [t.scheduleId, t.userId],
      foreignColumns: [schedules.id, schedules.userId],
    }).onDelete("cascade"),
    unique("schedule_exceptions_schedule_key_unique").on(t.scheduleId, t.occurrenceKey),
    check("schedule_exceptions_move_has_target", sql`(${t.kind} = 'move') = (${t.movedToLocal} is not null)`),
  ],
).enableRLS();
