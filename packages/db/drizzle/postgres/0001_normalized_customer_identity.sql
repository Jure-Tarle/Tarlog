ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "first_name" text;
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "last_name" text;
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "street" text;
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "house_number" text;
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "postal_code" text;
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "city" text;
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "country" text;
--> statement-breakpoint
UPDATE "customers"
SET "first_name" = CASE WHEN position(' ' in trim("name")) > 0 THEN split_part(trim("name"), ' ', 1) ELSE trim("name") END,
    "last_name" = CASE WHEN position(' ' in trim("name")) > 0 THEN substring(trim("name") from position(' ' in trim("name")) + 1) ELSE NULL END
WHERE "first_name" IS NULL AND "name" IS NOT NULL;
