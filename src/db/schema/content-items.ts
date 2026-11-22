import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { contentAccounts } from "./content-accounts";

// Production pipeline in order: ide -> naskah -> produksi -> editing -> siap -> terposting.
export const contentStatus = pgEnum("content_status", ["idea", "script", "production", "editing", "ready", "posted"]);

export const contentItems = pgTable(
  "content_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: contentStatus("status").notNull().default("idea"),
    // Required (DECISIONS.md D-021). Shown in the content account's own timezone.
    targetAt: timestamp("target_at", { withTimezone: true }).notNull(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // The database itself refuses an item that points at another user's account (D-008).
    foreignKey({
      name: "content_items_account_owner_fk",
      columns: [t.accountId, t.userId],
      foreignColumns: [contentAccounts.id, contentAccounts.userId],
    }).onDelete("cascade"),
    // Target for the same kind of owner-checked foreign key from deadlines and notes.
    unique("content_items_id_user_id_unique").on(t.id, t.userId),
    index("content_items_user_target_idx").on(t.userId, t.targetAt),
    index("content_items_account_target_idx").on(t.accountId, t.targetAt),
  ],
).enableRLS();

// Optional deadline per production stage. "posted" has none: that is target_at itself.
export const itemStageDeadlines = pgTable(
  "item_stage_deadlines",
  {
    itemId: uuid("item_id").notNull(),
    userId: text("user_id").notNull(),
    stage: contentStatus("stage").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.stage] }),
    foreignKey({
      name: "item_stage_deadlines_item_owner_fk",
      columns: [t.itemId, t.userId],
      foreignColumns: [contentItems.id, contentItems.userId],
    }).onDelete("cascade"),
    check("item_stage_deadlines_stage_check", sql`${t.stage} in ('script', 'production', 'editing', 'ready')`),
    // For "deadlines coming up" on the dashboard (Fase 5).
    index("item_stage_deadlines_user_due_idx").on(t.userId, t.dueAt),
  ],
).enableRLS();

// Markdown notes, several per item (DECISIONS.md D-021).
export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    itemId: uuid("item_id").notNull(),
    bodyMd: text("body_md").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      name: "notes_item_owner_fk",
      columns: [t.itemId, t.userId],
      foreignColumns: [contentItems.id, contentItems.userId],
    }).onDelete("cascade"),
    index("notes_item_idx").on(t.itemId),
  ],
).enableRLS();
