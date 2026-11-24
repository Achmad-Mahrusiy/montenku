ALTER TABLE "content_accounts" ADD COLUMN "feed_token" text;--> statement-breakpoint
ALTER TABLE "content_accounts" ADD CONSTRAINT "content_accounts_feed_token_unique" UNIQUE("feed_token");