// src/db/schema.ts — foreign key ทุกตัว
//
// ทำไมต้องมีไฟล์นี้: .references(() => user.id, ...) เป็นฟังก์ชันที่ drizzle-kit เรียกตอนสร้าง migration เท่านั้น
// ตอนแอปทำงานไม่มีใครเรียก → coverage ของ schema.ts ค้างที่ ~70%
// getTableConfig(table).foreignKeys + fk.reference() เรียกฟังก์ชันนั้นจริง แล้วเราตรวจว่าชี้ถูกตาราง + onDelete ถูก
//
// ก. schema.ts ประกาศ foreign key ตรงกับที่ตั้งใจ (EXPECTED)
// ข. DB ทดสอบที่ migrate แล้วมี foreign key ตรงกัน (กัน schema.ts กับไฟล์ migration ไม่ตรงกัน)
// ค. พฤติกรรมจริงใน DB: cascade ลบตาม · restrict ห้ามลบ
import { getTableName, is, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { beforeAll, describe, expect, test } from "vitest";
import * as schema from "@/db/schema";
import { comments, favorites, reports, sheets, user } from "@/db/schema";
import { signUpUser, type TestUser } from "../helpers/auth";
import { cleanDbBeforeAll, testDb } from "../helpers/db";

cleanDbBeforeAll();

type OnDelete = "cascade" | "restrict" | "no action";
type Fk = { table: string; columns: string[]; foreignTable: string; foreignColumns: string[]; onDelete: OnDelete };

const fk = (table: string, columns: string[], foreignTable: string, foreignColumns: string[], onDelete: OnDelete): Fk => ({
  table, columns, foreignTable, foreignColumns, onDelete,
});

// cascade  = ลบแถวแม่แล้วแถวลูกหายตาม (ข้อมูลที่ไม่มีความหมายถ้าไม่มีแม่)
// restrict = ห้ามลบแถวแม่ถ้ายังมีลูก (ต้องเก็บไว้: ชีทของผู้ใช้, หลักฐานการรายงาน, หมวดหมู่ที่มีชีทใช้)
const EXPECTED: Fk[] = [
  fk("account", ["user_id"], "user", ["id"], "cascade"),
  fk("collection_items", ["collection_id"], "collections", ["id"], "cascade"),
  fk("collection_items", ["sheet_id"], "sheets", ["id"], "cascade"),
  fk("collections", ["owner_id"], "user", ["id"], "cascade"),
  fk("comments", ["author_id"], "user", ["id"], "restrict"),
  // reply ต้องชี้ไปความคิดเห็นบนชีทเดียวกัน (composite FK)
  fk("comments", ["parent_comment_id", "sheet_id"], "comments", ["id", "sheet_id"], "no action"),
  fk("comments", ["sheet_id"], "sheets", ["id"], "cascade"),
  fk("favorites", ["sheet_id"], "sheets", ["id"], "cascade"),
  fk("favorites", ["user_id"], "user", ["id"], "cascade"),
  fk("reports", ["reporter_id"], "user", ["id"], "restrict"),
  fk("reports", ["sheet_id"], "sheets", ["id"], "cascade"),
  fk("session", ["user_id"], "user", ["id"], "cascade"),
  fk("sheet_files", ["sheet_id"], "sheets", ["id"], "cascade"),
  fk("sheet_reactions", ["sheet_id"], "sheets", ["id"], "cascade"),
  fk("sheet_reactions", ["user_id"], "user", ["id"], "cascade"),
  fk("sheets", ["category_id"], "categories", ["id"], "restrict"),
  fk("sheets", ["owner_id"], "user", ["id"], "restrict"),
  fk("sheets", ["subject_id"], "subjects", ["id"], "restrict"),
];

const key = (f: Fk) => `${f.table}(${f.columns.join(",")})`;
const sorted = (list: Fk[]) => [...list].sort((a, b) => key(a).localeCompare(key(b)));

/** foreign key ทุกตัวที่ schema.ts ประกาศ — fk.reference() คือจุดที่เรียก () => x.id */
function schemaForeignKeys(): Fk[] {
  // schema มีทั้งตาราง, relations และค่าคงที่ (SHEET_STATUSES ...) → คัดเฉพาะตาราง
  const tables = (Object.values(schema) as unknown[]).filter((v): v is PgTable => is(v, PgTable));
  return tables.flatMap((table) =>
    getTableConfig(table).foreignKeys.map((foreignKey) => {
      const ref = foreignKey.reference();
      return fk(
        getTableName(table),
        ref.columns.map((c) => c.name),
        getTableName(ref.foreignTable),
        ref.foreignColumns.map((c) => c.name),
        (foreignKey.onDelete ?? "no action") as OnDelete,
      );
    }),
  );
}

// ---------------------------------------------------------------------------
// ก. schema.ts
// ---------------------------------------------------------------------------

describe("schema.ts — foreign key", () => {
  const actual = schemaForeignKeys();

  test(`มี foreign key ครบ ${EXPECTED.length} ตัว ไม่ขาดไม่เกิน`, () => {
    expect(sorted(actual).map(key)).toEqual(sorted(EXPECTED).map(key));
  });

  test.each(EXPECTED.map((f) => [key(f), f] as const))("%s ชี้ไปตารางที่ถูก + onDelete ถูก", (_label, expected) => {
    expect(actual.find((a) => key(a) === key(expected))).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// ข. DB ที่ migrate แล้ว
// ---------------------------------------------------------------------------

describe("DB ทดสอบ (หลัง migrate) — foreign key ตรงกับ schema.ts", () => {
  test("ทุกตัวตรงกัน รวม onDelete", async () => {
    const rows = await testDb().execute<{ table: string; columns: string[]; foreignTable: string; foreignColumns: string[]; action: string }>(sql`
      select cl.relname as "table", fcl.relname as "foreignTable", c.confdeltype as action,
        (select array_agg(a.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(attnum, ord)
           join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as columns,
        (select array_agg(a.attname::text order by k.ord) from unnest(c.confkey) with ordinality k(attnum, ord)
           join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) as "foreignColumns"
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_class fcl on fcl.oid = c.confrelid
      join pg_namespace n on n.oid = cl.relnamespace
      where c.contype = 'f' and n.nspname = 'public'
        -- migration 0001 เก็บตารางเก่าของ starter ไว้เป็น legacy_* (ไม่อยู่ใน schema.ts ตั้งใจ)
        and cl.relname not like 'legacy\_%'`);

    const actions: Record<string, OnDelete> = { c: "cascade", r: "restrict", a: "no action" };
    const inDb = [...rows].map((r) => fk(r.table, r.columns, r.foreignTable, r.foreignColumns, actions[r.action]));
    expect(sorted(inDb)).toEqual(sorted(EXPECTED));
  });
});

// ---------------------------------------------------------------------------
// ค. พฤติกรรมจริง
// ---------------------------------------------------------------------------

describe("พฤติกรรมของ foreign key ใน DB จริง", () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    [alice, bob] = await Promise.all([signUpUser({ name: "Alice" }), signUpUser({ name: "Bob" })]);
  });

  const newSheet = async () =>
    (await testDb().insert(sheets).values({ ownerId: alice.id, title: "fk", status: "published" }).returning({ id: sheets.id }))[0].id;

  test("cascade: ลบชีท → ความคิดเห็นและ favorites ของชีทนั้นหายตาม", async () => {
    const sheetId = await newSheet();
    await testDb().insert(comments).values({ sheetId, authorId: bob.id, body: "hi" });
    await testDb().insert(favorites).values({ sheetId, userId: bob.id });

    await testDb().delete(sheets).where(sql`${sheets.id} = ${sheetId}`);

    expect(await testDb().select().from(comments).where(sql`${comments.sheetId} = ${sheetId}`)).toHaveLength(0);
    expect(await testDb().select().from(favorites).where(sql`${favorites.sheetId} = ${sheetId}`)).toHaveLength(0);
  });

  // Postgres รายงาน ON DELETE RESTRICT ด้วย code 23503 (foreign_key_violation) เหมือน FK ทั่วไป
  test("restrict: ลบผู้ใช้ที่เคยรายงานชีทไม่ได้ (เก็บหลักฐาน) → error 23503", async () => {
    const sheetId = await newSheet();
    await testDb().insert(reports).values({ reporterId: bob.id, sheetId, reason: "spam" });

    const error = await testDb().delete(user).where(sql`${user.id} = ${bob.id}`).then(() => null, (e: unknown) => e);
    // drizzle ห่อ error ของ postgres ไว้ใน cause
    const code = (error as { code?: string; cause?: { code?: string } } | null)?.cause?.code ?? (error as { code?: string } | null)?.code;
    expect(code).toBe("23503");
    expect(await testDb().select().from(user).where(sql`${user.id} = ${bob.id}`)).toHaveLength(1);
  });
});
