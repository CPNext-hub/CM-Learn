CREATE TABLE "favorites" (
  "user_id" text NOT NULL,
  "sheet_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "favorites_pk" PRIMARY KEY ("user_id", "sheet_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "is_public" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "collections_name_not_blank" CHECK (btrim("name") <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "collections_owner_name_uq" ON "collections" USING btree ("owner_id", "name");
--> statement-breakpoint
CREATE TABLE "collection_items" (
  "collection_id" uuid NOT NULL,
  "sheet_id" uuid NOT NULL,
  "added_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "collection_items_pk" PRIMARY KEY ("collection_id", "sheet_id")
);
--> statement-breakpoint
CREATE TABLE "reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reporter_id" text NOT NULL,
  "sheet_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "details" text,
  "status" text DEFAULT 'open' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "resolved_at" timestamptz,
  CONSTRAINT "reports_reason_valid" CHECK ("reason" in ('spam', 'copyright', 'inappropriate', 'other')),
  CONSTRAINT "reports_status_valid" CHECK ("status" in ('open', 'reviewing', 'resolved', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reports_reporter_sheet_uq" ON "reports" USING btree ("reporter_id", "sheet_id");
--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_sheet_id_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."sheets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_sheet_id_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."sheets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_sheet_id_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."sheets"("id") ON DELETE cascade ON UPDATE no action;
