CREATE TYPE "public"."content_status" AS ENUM('idea', 'script', 'production', 'editing', 'ready', 'posted');--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "content_status" DEFAULT 'idea' NOT NULL,
	"target_at" timestamp with time zone NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_items_id_user_id_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "content_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "item_stage_deadlines" (
	"item_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"stage" "content_status" NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	CONSTRAINT "item_stage_deadlines_item_id_stage_pk" PRIMARY KEY("item_id","stage"),
	CONSTRAINT "item_stage_deadlines_stage_check" CHECK ("item_stage_deadlines"."stage" in ('script', 'production', 'editing', 'ready'))
);
--> statement-breakpoint
ALTER TABLE "item_stage_deadlines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"body_md" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_account_owner_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."content_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_stage_deadlines" ADD CONSTRAINT "item_stage_deadlines_item_owner_fk" FOREIGN KEY ("item_id","user_id") REFERENCES "public"."content_items"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_item_owner_fk" FOREIGN KEY ("item_id","user_id") REFERENCES "public"."content_items"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_items_user_target_idx" ON "content_items" USING btree ("user_id","target_at");--> statement-breakpoint
CREATE INDEX "content_items_account_target_idx" ON "content_items" USING btree ("account_id","target_at");--> statement-breakpoint
CREATE INDEX "item_stage_deadlines_user_due_idx" ON "item_stage_deadlines" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "notes_item_idx" ON "notes" USING btree ("item_id");