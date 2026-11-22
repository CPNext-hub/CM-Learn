ALTER TABLE "summary" ADD COLUMN "category" text DEFAULT 'General' NOT NULL;
--> statement-breakpoint
ALTER TABLE "summary" ADD COLUMN "tags" text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE "summary" ADD COLUMN "file_name" text;
--> statement-breakpoint
ALTER TABLE "summary" ADD COLUMN "file_type" text;
--> statement-breakpoint
ALTER TABLE "summary" ADD COLUMN "file_size" integer;
--> statement-breakpoint
ALTER TABLE "summary" ADD COLUMN "file_data" text;
