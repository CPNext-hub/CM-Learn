ALTER TABLE "subject" ADD COLUMN "deleted_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "subject" ADD COLUMN "view_count" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "subject" ADD CONSTRAINT "subject_view_count_nonnegative_ck" CHECK ("view_count" >= 0);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" text PRIMARY KEY NOT NULL,
	"sheet_id" text NOT NULL,
	"author_id" text NOT NULL,
	"parent_comment_id" text,
	"body" text NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	"deleted_at" timestamptz,
	CONSTRAINT "comment_body_not_empty_ck" CHECK (length(trim("body")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "comment_id_sheet_id_uq" ON "comment" USING btree ("id", "sheet_id");
--> statement-breakpoint
CREATE INDEX "comment_sheet_created_idx" ON "comment" USING btree ("sheet_id", "created_at");
--> statement-breakpoint
CREATE TABLE "sheet_reaction" (
	"user_id" text NOT NULL,
	"sheet_id" text NOT NULL,
	"reaction" text NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "sheet_reaction_pk" PRIMARY KEY("user_id", "sheet_id"),
	CONSTRAINT "sheet_reaction_value_ck" CHECK ("reaction" in ('like', 'dislike'))
);
--> statement-breakpoint
CREATE TABLE "favorite" (
	"user_id" text NOT NULL,
	"sheet_id" text NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_pk" PRIMARY KEY("user_id", "sheet_id")
);
--> statement-breakpoint
CREATE TABLE "collection" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "collection_name_not_empty_ck" CHECK (length(trim("name")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "collection_owner_name_uq" ON "collection" USING btree ("owner_id", "name");
--> statement-breakpoint
CREATE TABLE "collection_item" (
	"collection_id" text NOT NULL,
	"sheet_id" text NOT NULL,
	"added_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "collection_item_pk" PRIMARY KEY("collection_id", "sheet_id")
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_id" text NOT NULL,
	"sheet_id" text NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"resolved_at" timestamptz,
	CONSTRAINT "report_reason_ck" CHECK ("reason" in ('spam', 'copyright', 'inappropriate', 'other')),
	CONSTRAINT "report_status_ck" CHECK ("status" in ('open', 'reviewing', 'resolved', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reporter_sheet_uq" ON "report" USING btree ("reporter_id", "sheet_id");
--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_sheet_id_subject_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."subject"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_parent_same_sheet_fk" FOREIGN KEY ("parent_comment_id", "sheet_id") REFERENCES "public"."comment"("id", "sheet_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sheet_reaction" ADD CONSTRAINT "sheet_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sheet_reaction" ADD CONSTRAINT "sheet_reaction_sheet_id_subject_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."subject"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_sheet_id_subject_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."subject"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_sheet_id_subject_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."subject"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_sheet_id_subject_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."subject"("id") ON DELETE cascade ON UPDATE no action;
