import { getSessionUser, isUuid } from "@/lib/api";
import { getInteractionSql } from "@/lib/interaction-db";
import { getSheetDtos } from "@/lib/sheets";

type Context = { params: Promise<{ path?: string[] }> };
type Viewer = { id: string } | null;
const ok = (data: unknown, status = 200) => Response.json({ data }, { status });
const bad = (message: string, status = 400) => Response.json({ error: { code: status === 401 ? "UNAUTHORIZED" : status === 404 ? "NOT_FOUND" : status === 409 ? "CONFLICT" : "VALIDATION_ERROR", message } }, { status });

async function getViewer(request: Request): Promise<Viewer> {
  const session = await getSessionUser(request);
  return session ? { id: session.id } : null;
}

async function jsonBody(request: Request) {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function sheetVisible(id: string, viewerId: string | null) {
  const db = await getInteractionSql();
  const rows = await db`select id from sheets where id = ${id} and deleted_at is null and (status = 'published' or owner_id = ${viewerId ?? ""}) limit 1`;
  return rows.length > 0;
}

async function dispatch(request: Request, context: Context) {
  const { path = [] } = await context.params;
  const method = request.method.toUpperCase();
  const user = await getViewer(request);
  const db = await getInteractionSql();

  // GET/POST /sheets/:id/comments
  if (path[0] === "sheets" && path.length === 3 && path[2] === "comments") {
    const sheetId = path[1];
    if (!isUuid(sheetId)) return bad("Sheet not found.", 404);
    if (method === "GET") {
      if (!(await sheetVisible(sheetId, user?.id ?? null))) return bad("Sheet not found.", 404);
      const rows = await db`
        select c.id, c.sheet_id as "sheetId", c.author_id as "authorId", u.name as "authorName", u.image as "authorImage",
          c.parent_comment_id as "parentCommentId", case when c.deleted_at is null then c.body else '' end as body,
          (c.deleted_at is not null) as deleted, c.created_at as "createdAt", c.updated_at as "updatedAt"
        from "comments" c join "user" u on u.id = c.author_id where c.sheet_id = ${sheetId} order by c.created_at asc`;
      const byId = new Map<string, Record<string, unknown> & { replies: unknown[] }>();
      for (const row of rows) byId.set(String(row.id), { ...row, replies: [] });
      const roots: unknown[] = [];
      for (const item of byId.values()) {
        if (typeof item.parentCommentId === "string" && byId.has(item.parentCommentId)) byId.get(item.parentCommentId)!.replies.push(item);
        else roots.push(item);
      }
      return ok(roots);
    }
    if (method === "POST") {
      if (!user) return bad("Authentication required.", 401);
      if (!(await sheetVisible(sheetId, user.id))) return bad("Sheet not found.", 404);
      const content = clean((await jsonBody(request))?.body);
      if (!content) return bad("Comment body is required.");
      if (content.length > 5000) return bad("Comment body must be 5,000 characters or fewer.");
      const rows = await db`insert into "comments" (id, sheet_id, author_id, body) values (${crypto.randomUUID()}, ${sheetId}, ${user.id}, ${content}) returning id, sheet_id as "sheetId", author_id as "authorId", body, parent_comment_id as "parentCommentId", created_at as "createdAt", updated_at as "updatedAt"`;
      return ok(rows[0], 201);
    }
  }

  // POST /comments/:id/replies. Replies may target roots only.
  if (path[0] === "comments" && path.length === 3 && path[2] === "replies" && method === "POST") {
    if (!user) return bad("Authentication required.", 401);
    if (!isUuid(path[1])) return bad("Comment not found.", 404);
    const content = clean((await jsonBody(request))?.body);
    if (!content) return bad("Reply body is required.");
    if (content.length > 5000) return bad("Reply body must be 5,000 characters or fewer.");
    const [parent] = await db`select id, sheet_id as "sheetId", parent_comment_id as "parentId", deleted_at as "deletedAt" from "comments" where id = ${path[1]} limit 1`;
    if (!parent || parent.deletedAt || parent.parentId) return bad("A reply can only target an active top-level comment.", 404);
    if (!(await sheetVisible(String(parent.sheetId), user.id))) return bad("Sheet not found.", 404);
    const rows = await db`insert into "comments" (id, sheet_id, author_id, parent_comment_id, body) values (${crypto.randomUUID()}, ${parent.sheetId}, ${user.id}, ${path[1]}, ${content}) returning id, sheet_id as "sheetId", author_id as "authorId", body, parent_comment_id as "parentCommentId", created_at as "createdAt"`;
    return ok(rows[0], 201);
  }

  // DELETE /comments/:id (soft delete; author only)
  if (path[0] === "comments" && path.length === 2 && method === "DELETE") {
    if (!user) return bad("Authentication required.", 401);
    if (!isUuid(path[1])) return bad("Comment not found.", 404);
    const rows = await db`update "comments" set deleted_at = now(), updated_at = now() where id = ${path[1]} and author_id = ${user.id} and deleted_at is null returning id`;
    return rows.length ? ok({ deleted: true }) : bad("Comment not found or not owned by you.", 404);
  }

  // POST/DELETE /sheets/:id/reactions
  if (path[0] === "sheets" && path.length === 3 && path[2] === "reactions") {
    if (!user) return bad("Authentication required.", 401);
    const sheetId = path[1];
    if (!isUuid(sheetId)) return bad("Sheet not found.", 404);
    if (!(await sheetVisible(sheetId, user.id))) return bad("Sheet not found.", 404);
    if (method === "POST") {
      const reaction = (await jsonBody(request))?.reaction;
      if (reaction !== "like" && reaction !== "dislike") return bad("Reaction must be 'like' or 'dislike'.");
      const [saved] = await db`insert into sheet_reactions (user_id, sheet_id, reaction) values (${user.id}, ${sheetId}, ${reaction}) on conflict (user_id, sheet_id) do update set reaction = excluded.reaction, updated_at = now() returning user_id as "userId", sheet_id as "sheetId", reaction, created_at as "createdAt", updated_at as "updatedAt"`;
      const [counts] = await db`select count(*) filter (where reaction = 'like')::int as likes, count(*) filter (where reaction = 'dislike')::int as dislikes from sheet_reactions where sheet_id = ${sheetId}`;
      return ok({ ...saved, ...counts });
    }
    if (method === "DELETE") {
      await db`delete from sheet_reactions where user_id = ${user.id} and sheet_id = ${sheetId}`;
      return ok({ removed: true });
    }
  }

  // GET /favorites; POST|DELETE /favorites/:sheetId
  if (path[0] === "favorites") {
    if (!user) return bad("Authentication required.", 401);
    if (path.length === 2 && !isUuid(path[1])) return bad("Sheet not found.", 404);
    if (path.length === 1 && method === "GET") {
      const rows = await db`select s.id, s.owner_id as "ownerId", f.created_at as "favoritedAt" from favorites f join sheets s on s.id = f.sheet_id where f.user_id = ${user.id} and s.deleted_at is null and (s.status = 'published' or s.owner_id = ${user.id}) order by f.created_at desc`;
      // Same sheet shape as GET /sheets (owner, subject, category, file, counts, previewUrl…) + favoritedAt.
      const sheets = await getSheetDtos(rows.map((r) => String(r.id)));
      return ok(rows.flatMap((r) => {
        const sheet = sheets.get(String(r.id));
        return sheet ? [{ ...sheet, ownerId: r.ownerId, favoritedAt: r.favoritedAt }] : [];
      }));
    }
    if (path.length === 2 && method === "POST") {
      if (!(await sheetVisible(path[1], user.id))) return bad("Sheet not found.", 404);
      await db`insert into favorites (user_id, sheet_id) values (${user.id}, ${path[1]}) on conflict do nothing`;
      return ok({ sheetId: path[1], favorited: true }, 201);
    }
    if (path.length === 2 && method === "DELETE") {
      await db`delete from favorites where user_id = ${user.id} and sheet_id = ${path[1]}`;
      return ok({ sheetId: path[1], favorited: false });
    }
  }

  // GET/POST /collections; POST /collections/:id/sheets; GET that collection's sheets; DELETE one item.
  if (path[0] === "collections") {
    if (!user) return bad("Authentication required.", 401);
    if (path.length >= 2 && !isUuid(path[1])) return bad("Collection not found.", 404);
    if (path.length === 4 && !isUuid(path[3])) return bad("Sheet not found.", 404);
    if (path.length === 1 && method === "GET") {
      const rows = await db`select c.id, c.name, c.description, c.is_public as "isPublic", c.created_at as "createdAt", count(ci.sheet_id)::int as "sheetCount" from collections c left join collection_items ci on ci.collection_id = c.id where c.owner_id = ${user.id} group by c.id order by c.created_at desc`;
      return ok(rows);
    }
    if (path.length === 1 && method === "POST") {
      const input = await jsonBody(request);
      const name = clean(input?.name);
      const description = clean(input?.description) || null;
      if (!name) return bad("Collection name is required.");
      if (name.length > 120 || (description?.length ?? 0) > 1000) return bad("Collection name or description is too long.");
      try {
        const rows = await db`insert into collections (id, owner_id, name, description, is_public) values (${crypto.randomUUID()}, ${user.id}, ${name}, ${description}, ${input?.isPublic === true}) returning id, owner_id as "ownerId", name, description, is_public as "isPublic", created_at as "createdAt"`;
        return ok(rows[0], 201);
      } catch (error) {
        if ((error as { code?: string }).code === "23505") return bad("You already have a collection with that name.", 409);
        throw error;
      }
    }
    if (path.length === 3 && path[2] === "sheets" && method === "POST") {
      const input = await jsonBody(request);
      const sheetId = typeof input?.sheetId === "string" ? input.sheetId : "";
      if (!sheetId) return bad("sheetId is required.");
      const owns = await db`select id from collections where id = ${path[1]} and owner_id = ${user.id}`;
      if (!owns.length) return bad("Collection not found.", 404);
      if (!(await sheetVisible(sheetId, user.id))) return bad("Sheet not found.", 404);
      await db`insert into collection_items (collection_id, sheet_id) values (${path[1]}, ${sheetId}) on conflict do nothing`;
      return ok({ collectionId: path[1], sheetId, added: true }, 201);
    }
    if (path.length === 3 && path[2] === "sheets" && method === "GET") {
      const rows = await db`select s.id, s.title, s.description, ci.added_at as "addedAt" from collections c join collection_items ci on ci.collection_id = c.id join sheets s on s.id = ci.sheet_id where c.id = ${path[1]} and (c.owner_id = ${user.id} or c.is_public) and s.deleted_at is null and (s.status = 'published' or s.owner_id = ${user.id}) order by ci.added_at desc`;
      return ok(rows);
    }
    if (path.length === 4 && path[2] === "sheets" && method === "DELETE") {
      const rows = await db`delete from collection_items ci using collections c where ci.collection_id = c.id and c.owner_id = ${user.id} and ci.collection_id = ${path[1]} and ci.sheet_id = ${path[3]} returning ci.sheet_id`;
      return rows.length ? ok({ removed: true }) : bad("Collection item not found.", 404);
    }
  }

  // POST /sheets/:id/reports
  if (path[0] === "sheets" && path.length === 3 && path[2] === "reports" && method === "POST") {
    if (!user) return bad("Authentication required.", 401);
    if (!isUuid(path[1])) return bad("Sheet not found.", 404);
    if (!(await sheetVisible(path[1], user.id))) return bad("Sheet not found.", 404);
    const input = await jsonBody(request);
    const reason = input?.reason;
    if (typeof reason !== "string" || !["spam", "copyright", "inappropriate", "other"].includes(reason)) return bad("Invalid report reason.");
    const details = clean(input?.details) || null;
    if ((details?.length ?? 0) > 2000) return bad("Report details must be 2,000 characters or fewer.");
    try {
      const rows = await db`insert into reports (id, reporter_id, sheet_id, reason, details) values (${crypto.randomUUID()}, ${user.id}, ${path[1]}, ${reason}, ${details}) returning id, reporter_id as "reporterId", sheet_id as "sheetId", reason, details, status, created_at as "createdAt"`;
      return ok(rows[0], 201);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return bad("You have already reported this sheet.", 409);
      throw error;
    }
  }

  // GET /users/me/dashboard.
  if (path.join("/") === "users/me/dashboard" && method === "GET") {
    if (!user) return bad("Authentication required.", 401);
    const [counts] = await db`
      select
        (select count(*)::int from sheets s where s.owner_id = ${user.id} and s.deleted_at is null) as "totalSheets",
        (select count(*)::int from sheets s where s.owner_id = ${user.id} and s.status = 'published' and s.deleted_at is null) as "publishedSheets",
        (select coalesce(sum(s.view_count), 0)::float8 from sheets s where s.owner_id = ${user.id} and s.deleted_at is null) as "totalViews",
        (select count(*)::int from "comments" c join sheets s on s.id = c.sheet_id where s.owner_id = ${user.id} and c.deleted_at is null) as "commentsReceived",
        (select count(*)::int from favorites f join sheets s on s.id = f.sheet_id where s.owner_id = ${user.id}) as "favoritesReceived",
        (select count(*)::int from sheet_reactions r join sheets s on s.id = r.sheet_id where s.owner_id = ${user.id} and r.reaction = 'like') as likes,
        (select count(*)::int from sheet_reactions r join sheets s on s.id = r.sheet_id where s.owner_id = ${user.id} and r.reaction = 'dislike') as dislikes`;
    return ok(counts);
  }

  return bad("Route not found.", 404);
}

async function run(request: Request, context: Context) {
  try { return await dispatch(request, context); }
  catch (error) {
    console.error("Interaction API request failed", error);
    return bad("Internal server error.", 500);
  }
}

export async function GET(request: Request, context: Context) { return run(request, context); }
export async function POST(request: Request, context: Context) { return run(request, context); }
export async function DELETE(request: Request, context: Context) { return run(request, context); }
