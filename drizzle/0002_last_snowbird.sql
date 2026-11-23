CREATE TYPE "public"."schedule_exception_kind" AS ENUM('skip', 'move');--> statement-breakpoint
CREATE TABLE "schedule_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"schedule_id" uuid NOT NULL,
	"occurrence_key" text NOT NULL,
	"kind" "schedule_exception_kind" NOT NULL,
	"moved_to_local" timestamp,
	CONSTRAINT "schedule_exceptions_schedule_key_unique" UNIQUE("schedule_id","occurrence_key"),
	CONSTRAINT "schedule_exceptions_move_has_target" CHECK (("schedule_exceptions"."kind" = 'move') = ("schedule_exceptions"."moved_to_local" is not null))
);
--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"title" text NOT NULL,
	"rrule" text NOT NULL,
	"dtstart_local" timestamp NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedules_id_user_id_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "schedule_id" uuid;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "occurrence_key" text;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_schedule_owner_fk" FOREIGN KEY ("schedule_id","user_id") REFERENCES "public"."schedules"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_account_owner_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."content_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedules_user_idx" ON "schedules" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_schedule_owner_fk" FOREIGN KEY ("schedule_id","user_id") REFERENCES "public"."schedules"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_schedule_slot_unique" UNIQUE("schedule_id","occurrence_key");--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_slot_complete" CHECK (("content_items"."schedule_id" is null) = ("content_items"."occurrence_key" is null));