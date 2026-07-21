ALTER TABLE "rounding_rules" ADD COLUMN IF NOT EXISTS "priority" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "rounding_rules"
SET "priority" = CASE "scope"
  WHEN 'task' THEN 400
  WHEN 'project' THEN 300
  WHEN 'customer' THEN 200
  ELSE 0
END;
