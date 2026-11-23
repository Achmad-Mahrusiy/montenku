CREATE TYPE "public"."reminder_status" AS ENUM('pending', 'sending', 'sent', 'cancelled', 'failed');--> statement-breakpoint
CREATE TABLE "reminder_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"item_id" uuid,
	"schedule_id" uuid,
	"offset_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_settings_item_offset_unique" UNIQUE("item_id","offset_minutes"),
	CONSTRAINT "reminder_settings_schedule_offset_unique" UNIQUE("schedule_id","offset_minutes"),
	CONSTRAINT "reminder_settings_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "reminder_settings_one_target" CHECK (("reminder_settings"."item_id" is null) <> ("reminder_settings"."schedule_id" is null)),
	CONSTRAINT "reminder_settings_offset_range" CHECK ("reminder_settings"."offset_minutes" between 0 and 10080)
);
--> statement-breakpoint
ALTER TABLE "reminder_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"reminder_setting_id" uuid NOT NULL,
	"occurrence_key" text NOT NULL,
	"target_at" timestamp with time zone NOT NULL,
	"send_at" timestamp with time zone NOT NULL,
	"status" "reminder_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"enqueued_send_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_setting_occurrence_unique" UNIQUE("reminder_setting_id","occurrence_key")
);
--> statement-breakpoint
ALTER TABLE "reminders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reminder_settings" ADD CONSTRAINT "reminder_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_settings" ADD CONSTRAINT "reminder_settings_item_owner_fk" FOREIGN KEY ("item_id","user_id") REFERENCES "public"."content_items"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_settings" ADD CONSTRAINT "reminder_settings_schedule_owner_fk" FOREIGN KEY ("schedule_id","user_id") REFERENCES "public"."schedules"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_setting_owner_fk" FOREIGN KEY ("reminder_setting_id","user_id") REFERENCES "public"."reminder_settings"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminders_status_send_at_idx" ON "reminders" USING btree ("status","send_at");