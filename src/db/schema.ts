import { bigint, boolean, integer, pgTable, text, timestamp, primaryKey, uniqueIndex, index, foreignKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Better Auth tables. Keep these aligned with Better Auth's Drizzle adapter.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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
