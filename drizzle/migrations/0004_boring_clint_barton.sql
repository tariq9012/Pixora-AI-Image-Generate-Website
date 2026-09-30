CREATE TYPE "public"."stripe_webhook_event_status" AS ENUM('PROCESSING', 'PROCESSED', 'FAILED');--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"type" text NOT NULL,
	"status" "stripe_webhook_event_status" DEFAULT 'PROCESSING' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
DROP INDEX "subscriptions_provider_subscription_id_idx";--> statement-breakpoint
DROP INDEX "payments_provider_payment_id_idx";--> statement-breakpoint
DROP INDEX "credit_transactions_payment_id_idx";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "last_synced_event_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_webhook_events_stripe_event_id_unique_idx" ON "stripe_webhook_events" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE INDEX "stripe_webhook_events_status_idx" ON "stripe_webhook_events" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_stripe_customer_id_unique_idx" ON "users" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_subscription_id_unique_idx" ON "subscriptions" USING btree ("provider_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_payment_id_unique_idx" ON "payments" USING btree ("provider_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_transactions_payment_id_unique_idx" ON "credit_transactions" USING btree ("payment_id");