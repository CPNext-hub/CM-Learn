<<<<<<< HEAD
import { bigint, boolean, integer, pgTable, text, timestamp, primaryKey, uniqueIndex, index, foreignKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
=======
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
>>>>>>> 2a2deed09d180ddcb529137521c14cfe112e8bac

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Every timestamp is timestamptz (stored as UTC). The API converts to the viewer's timezone.
const tz = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => tz("created_at").notNull().defaultNow();
// $onUpdate makes Drizzle set updated_at automatically on every db.update(...).
const updatedAt = () =>
  tz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const SHEET_STATUSES = ["draft", "published", "hidden"] as const;
export const ASSET_TYPES = ["original", "preview"] as const;
export const REACTIONS = ["like", "dislike"] as const;

// ---------------------------------------------------------------------------
// Better Auth tables (keep names/fields aligned with Better Auth's Drizzle adapter).
// `user` plays the role of the `users` table in the design doc:
//   display_name -> name, avatar_url -> image, password_hash -> account.password
// Better Auth generates text ids, so every FK pointing at user.id is text.
// ---------------------------------------------------------------------------

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: text("role").notNull().default("user"),
    bio: text("bio"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: tz("deleted_at"),
  },
  (t) => [
    uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`),
    check("users_name_not_blank", sql`btrim(${t.name}) <> ''`),
  ],
);

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: tz("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: tz("access_token_expires_at"),
  refreshTokenExpiresAt: tz("refresh_token_expires_at"),
  scope: text("scope"),
  // Better Auth stores the password HASH here (never plaintext) for email/password accounts.
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: tz("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

<<<<<<< HEAD
// Main product entities. Public display is opt-in; only owners can edit.
export const subject = pgTable("subject", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  isPublished: boolean("is_published").notNull().default(false),
  viewCount: bigint("view_count", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [check("subject_view_count_nonnegative_ck", sql`${t.viewCount} >= 0`)]);

export const summary = pgTable("summary", {
  id: text("id").primaryKey(),
  subjectId: text("subject_id").notNull().references(() => subject.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Interaction Backend tables. In this starter, `subject` is the sheet entity.
export const comment = pgTable("comment", {
  id: text("id").primaryKey(),
  sheetId: text("sheet_id").notNull().references(() => subject.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  parentCommentId: text("parent_comment_id"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("comment_id_sheet_id_uq").on(t.id, t.sheetId),
  index("comment_sheet_created_idx").on(t.sheetId, t.createdAt),
  foreignKey({ columns: [t.parentCommentId, t.sheetId], foreignColumns: [t.id, t.sheetId], name: "comment_parent_same_sheet_fk" }).onDelete("cascade"),
  check("comment_body_not_empty_ck", sql`length(trim(${t.body})) > 0`),
]);

export const sheetReaction = pgTable("sheet_reaction", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sheetId: text("sheet_id").notNull().references(() => subject.id, { onDelete: "cascade" }),
  reaction: text("reaction").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ name: "sheet_reaction_pk", columns: [t.userId, t.sheetId] }), check("sheet_reaction_value_ck", sql`${t.reaction} in ('like', 'dislike')`)]);

export const favorite = pgTable("favorite", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sheetId: text("sheet_id").notNull().references(() => subject.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ name: "favorite_pk", columns: [t.userId, t.sheetId] })]);

export const collection = pgTable("collection", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  isPublic: boolean("is_public").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("collection_owner_name_uq").on(t.ownerId, t.name), check("collection_name_not_empty_ck", sql`length(trim(${t.name})) > 0`)]);

export const collectionItem = pgTable("collection_item", {
  collectionId: text("collection_id").notNull().references(() => collection.id, { onDelete: "cascade" }),
  sheetId: text("sheet_id").notNull().references(() => subject.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ name: "collection_item_pk", columns: [t.collectionId, t.sheetId] })]);

export const report = pgTable("report", {
  id: text("id").primaryKey(),
  reporterId: text("reporter_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  sheetId: text("sheet_id").notNull().references(() => subject.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  details: text("details"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => [uniqueIndex("reporter_sheet_uq").on(t.reporterId, t.sheetId), check("report_reason_ck", sql`${t.reason} in ('spam', 'copyright', 'inappropriate', 'other')`), check("report_status_ck", sql`${t.status} in ('open', 'reviewing', 'resolved', 'rejected')`)]);
=======
// ---------------------------------------------------------------------------
// Core MVP: lookup tables
// ---------------------------------------------------------------------------

export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [check("subjects_name_not_blank", sql`btrim(${t.name}) <> ''`)],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [check("categories_name_not_blank", sql`btrim(${t.name}) <> ''`)],
);

// ---------------------------------------------------------------------------
// Core MVP: sheets and their files
// ---------------------------------------------------------------------------

export const sheets = pgTable(
  "sheets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", { enum: SHEET_STATUSES }).notNull().default("draft"),
    viewCount: bigint("view_count", { mode: "number" }).notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: tz("deleted_at"),
  },
  (t) => [
    check("sheets_title_not_blank", sql`btrim(${t.title}) <> ''`),
    check("sheets_status_valid", sql`${t.status} in ('draft', 'published', 'hidden')`),
    check("sheets_view_count_non_negative", sql`${t.viewCount} >= 0`),
    index("sheets_owner_idx").on(t.ownerId),
    index("sheets_subject_idx").on(t.subjectId),
    index("sheets_category_idx").on(t.categoryId),
    index("sheets_status_created_idx").on(t.status, t.createdAt),
    // Full-text search over title + description. Queries must use the SAME expression to hit this index.
    index("sheets_search_idx").using(
      "gin",
      sql`to_tsvector('simple', coalesce(${t.title}, '') || ' ' || coalesce(${t.description}, ''))`,
    ),
  ],
);

export const sheetFiles = pgTable(
  "sheet_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sheetId: uuid("sheet_id")
      .notNull()
      .references(() => sheets.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull().default(1),
    assetType: text("asset_type", { enum: ASSET_TYPES }).notNull().default("original"),
    // Path/key inside file storage. NEVER send this to the client.
    storageKey: text("storage_key").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("sheet_files_sheet_version_asset_uq").on(t.sheetId, t.versionNo, t.assetType),
    check("sheet_files_version_positive", sql`${t.versionNo} > 0`),
    check("sheet_files_asset_type_valid", sql`${t.assetType} in ('original', 'preview')`),
    check("sheet_files_size_non_negative", sql`${t.sizeBytes} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Core MVP: interactions (APIs are owned by BE02)
// ---------------------------------------------------------------------------

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sheetId: uuid("sheet_id")
      .notNull()
      .references(() => sheets.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    // NULL = top-level comment. One reply level only: enforced in the API/service layer.
    parentCommentId: uuid("parent_comment_id"),
    body: text("body").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: tz("deleted_at"),
  },
  (t) => [
    check("comments_body_not_blank", sql`btrim(${t.body}) <> ''`),
    // Target for the composite FK below.
    unique("comments_id_sheet_uq").on(t.id, t.sheetId),
    // A reply must point to a parent comment ON THE SAME SHEET.
    foreignKey({
      name: "comments_parent_same_sheet_fk",
      columns: [t.parentCommentId, t.sheetId],
      foreignColumns: [t.id, t.sheetId],
    }),
    index("comments_sheet_created_idx").on(t.sheetId, t.createdAt),
    index("comments_parent_idx").on(t.parentCommentId),
  ],
);

export const sheetReactions = pgTable(
  "sheet_reactions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sheetId: uuid("sheet_id")
      .notNull()
      .references(() => sheets.id, { onDelete: "cascade" }),
    reaction: text("reaction", { enum: REACTIONS }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One reaction per user per sheet. Switching like <-> dislike updates this same row.
    primaryKey({ name: "sheet_reactions_pk", columns: [t.userId, t.sheetId] }),
    check("sheet_reactions_reaction_valid", sql`${t.reaction} in ('like', 'dislike')`),
    index("sheet_reactions_sheet_idx").on(t.sheetId),
  ],
);

// ---------------------------------------------------------------------------
// Relations: let Drizzle's db.query API load related rows with `with: { ... }`.
// These do not change the database; they only help TypeScript queries.
// ---------------------------------------------------------------------------

export const userRelations = relations(user, ({ many }) => ({
  sheets: many(sheets),
  comments: many(comments),
  reactions: many(sheetReactions),
}));

export const subjectRelations = relations(subjects, ({ many }) => ({ sheets: many(sheets) }));
export const categoryRelations = relations(categories, ({ many }) => ({ sheets: many(sheets) }));

export const sheetRelations = relations(sheets, ({ one, many }) => ({
  owner: one(user, { fields: [sheets.ownerId], references: [user.id] }),
  subject: one(subjects, { fields: [sheets.subjectId], references: [subjects.id] }),
  category: one(categories, { fields: [sheets.categoryId], references: [categories.id] }),
  files: many(sheetFiles),
  comments: many(comments),
  reactions: many(sheetReactions),
}));

export const sheetFileRelations = relations(sheetFiles, ({ one }) => ({
  sheet: one(sheets, { fields: [sheetFiles.sheetId], references: [sheets.id] }),
}));

export const commentRelations = relations(comments, ({ one, many }) => ({
  sheet: one(sheets, { fields: [comments.sheetId], references: [sheets.id] }),
  author: one(user, { fields: [comments.authorId], references: [user.id] }),
  parent: one(comments, {
    fields: [comments.parentCommentId],
    references: [comments.id],
    relationName: "replies",
  }),
  replies: many(comments, { relationName: "replies" }),
}));

export const sheetReactionRelations = relations(sheetReactions, ({ one }) => ({
  user: one(user, { fields: [sheetReactions.userId], references: [user.id] }),
  sheet: one(sheets, { fields: [sheetReactions.sheetId], references: [sheets.id] }),
}));

// ---------------------------------------------------------------------------
// Row types for API code: `Sheet` is a row you read, `NewSheet` is a row you insert.
// ---------------------------------------------------------------------------

export type User = typeof user.$inferSelect;
export type Subject = typeof subjects.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Sheet = typeof sheets.$inferSelect;
export type NewSheet = typeof sheets.$inferInsert;
export type SheetFile = typeof sheetFiles.$inferSelect;
export type NewSheetFile = typeof sheetFiles.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type SheetReaction = typeof sheetReactions.$inferSelect;
>>>>>>> 2a2deed09d180ddcb529137521c14cfe112e8bac
