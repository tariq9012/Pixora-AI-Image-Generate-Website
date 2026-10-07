CREATE TABLE "upload_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "asset_purpose" NOT NULL,
	"storage_key" text NOT NULL,
	"expected_mime_type" text NOT NULL,
	"expected_size" integer NOT NULL,
	"original_filename" text,
	"expires_at" timestamp with time zone NOT NULL,
	"finalize_claimed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "upload_intents" ADD CONSTRAINT "upload_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_intents" ADD CONSTRAINT "upload_intents_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "upload_intents_storage_key_unique_idx" ON "upload_intents" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "upload_intents_user_id_created_at_idx" ON "upload_intents" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "upload_intents_expires_at_idx" ON "upload_intents" USING btree ("expires_at");