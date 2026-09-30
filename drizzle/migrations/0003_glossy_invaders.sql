ALTER TYPE "public"."asset_purpose" ADD VALUE 'AI_INPUT';--> statement-breakpoint
ALTER TYPE "public"."asset_purpose" ADD VALUE 'IMAGE_TO_IMAGE_INPUT';--> statement-breakpoint
ALTER TYPE "public"."asset_purpose" ADD VALUE 'BACKGROUND_REMOVAL_INPUT';--> statement-breakpoint
ALTER TYPE "public"."asset_purpose" ADD VALUE 'UPSCALE_INPUT';--> statement-breakpoint
ALTER TYPE "public"."asset_purpose" ADD VALUE 'OUTPAINT_INPUT';--> statement-breakpoint
ALTER TYPE "public"."asset_purpose" ADD VALUE 'EDITOR_INPUT';--> statement-breakpoint
ALTER TYPE "public"."asset_purpose" ADD VALUE 'GENERATED_OUTPUT';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "original_filename" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_asset_id_assets_id_fk" FOREIGN KEY ("avatar_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;