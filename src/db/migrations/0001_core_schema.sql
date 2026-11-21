-- 0001_core_schema: upgrade the starter schema (0000_initial) to the CM Learn Core MVP schema.
-- Hand-written so databases that already ran 0000_initial are upgraded in place without losing data.

-- 1) Keep the starter's course tables as legacy tables (data preserved, no longer used by the app).
--    Drop them once the team confirms nothing in them is needed.
ALTER TABLE "summary" RENAME TO "legacy_summary";
--> statement-breakpoint
ALTER TABLE "subject" RENAME TO "legacy_subject";
--> statement-breakpoint

-- 2) Better Auth tables: timestamps -> timestamptz (existing values were written as UTC).
ALTER TABLE "user"
  ALTER COLUMN "created_at" TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC',
  ADD COLUMN "bio" text,
  ADD COLUMN "deleted_at" timestamp with time zone;
--> statement-breakpoint
-- Case-insensitive unique email replaces the plain unique constraint.
ALTER TABLE "user" DROP CONSTRAINT "user_email_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "user" USING btree (lower("email"));
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "users_name_not_blank" CHECK (btrim("user"."name") <> '');
--> statement-breakpoint
ALTER TABLE "session"
  ALTER COLUMN "expires_at" TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "account"
  ALTER COLUMN "access_token_expires_at" TYPE timestamp with time zone USING "access_token_expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "refresh_token_expires_at" TYPE timestamp with time zone USING "refresh_token_expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
UPDATE "verification" SET "created_at" = now() WHERE "created_at" IS NULL;
--> statement-breakpoint
UPDATE "verification" SET "updated_at" = now() WHERE "updated_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "verification"
  ALTER COLUMN "expires_at" TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET NOT NULL,
  ALTER COLUMN "updated_at" TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" SET NOT NULL;
--> statement-breakpoint

-- 3) New Core MVP tables.
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_name_unique" UNIQUE("name"),
	CONSTRAINT "subjects_name_not_blank" CHECK (btrim("subjects"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name"),
	CONSTRAINT "categories_name_not_blank" CHECK (btrim("categories"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"subject_id" uuid,
	"category_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"view_count" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "sheets_title_not_blank" CHECK (btrim("sheets"."title") <> ''),
	CONSTRAINT "sheets_status_valid" CHECK ("sheets"."status" in ('draft', 'published', 'hidden')),
	CONSTRAINT "sheets_view_count_non_negative" CHECK ("sheets"."view_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sheet_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"version_no" integer DEFAULT 1 NOT NULL,
	"asset_type" text DEFAULT 'original' NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sheet_files_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "sheet_files_sheet_version_asset_uq" UNIQUE("sheet_id","version_no","asset_type"),
	CONSTRAINT "sheet_files_version_positive" CHECK ("sheet_files"."version_no" > 0),
	CONSTRAINT "sheet_files_asset_type_valid" CHECK ("sheet_files"."asset_type" in ('original', 'preview')),
	CONSTRAINT "sheet_files_size_non_negative" CHECK ("sheet_files"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"parent_comment_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "comments_id_sheet_uq" UNIQUE("id","sheet_id"),
	CONSTRAINT "comments_body_not_blank" CHECK (btrim("comments"."body") <> '')
);
--> statement-breakpoint
CREATE TABLE "sheet_reactions" (
	"user_id" text NOT NULL,
	"sheet_id" uuid NOT NULL,
	"reaction" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sheet_reactions_pk" PRIMARY KEY("user_id","sheet_id"),
	CONSTRAINT "sheet_reactions_reaction_valid" CHECK ("sheet_reactions"."reaction" in ('like', 'dislike'))
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_sheet_id_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."sheets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_same_sheet_fk" FOREIGN KEY ("parent_comment_id","sheet_id") REFERENCES "public"."comments"("id","sheet_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sheet_files" ADD CONSTRAINT "sheet_files_sheet_id_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."sheets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sheet_reactions" ADD CONSTRAINT "sheet_reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sheet_reactions" ADD CONSTRAINT "sheet_reactions_sheet_id_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."sheets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sheets" ADD CONSTRAINT "sheets_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sheets" ADD CONSTRAINT "sheets_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sheets" ADD CONSTRAINT "sheets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "comments_sheet_created_idx" ON "comments" USING btree ("sheet_id","created_at");
--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_comment_id");
--> statement-breakpoint
CREATE INDEX "sheet_reactions_sheet_idx" ON "sheet_reactions" USING btree ("sheet_id");
--> statement-breakpoint
CREATE INDEX "sheets_owner_idx" ON "sheets" USING btree ("owner_id");
--> statement-breakpoint
CREATE INDEX "sheets_subject_idx" ON "sheets" USING btree ("subject_id");
--> statement-breakpoint
CREATE INDEX "sheets_category_idx" ON "sheets" USING btree ("category_id");
--> statement-breakpoint
CREATE INDEX "sheets_status_created_idx" ON "sheets" USING btree ("status","created_at");
--> statement-breakpoint
CREATE INDEX "sheets_search_idx" ON "sheets" USING gin (to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("description", '')));
--> statement-breakpoint

-- 4) Data migration: course titles from the starter become subject names in the new lookup table.
--    Summary content has no equivalent (sheets need an uploaded file), so it stays in legacy_summary.
INSERT INTO "subjects" ("name")
SELECT DISTINCT btrim("title") FROM "legacy_subject" WHERE btrim("title") <> ''
ON CONFLICT ("name") DO NOTHING;
