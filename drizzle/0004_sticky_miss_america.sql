CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"quiet_start" time,
	"quiet_end" time,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_quiet_pair" CHECK (("user_settings"."quiet_start" is null) = ("user_settings"."quiet_end" is null)),
	CONSTRAINT "user_settings_quiet_not_empty" CHECK ("user_settings"."quiet_start" is distinct from "user_settings"."quiet_end" or "user_settings"."quiet_start" is null)
);
--> statement-breakpoint
ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;