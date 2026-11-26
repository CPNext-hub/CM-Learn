// src/db/client.ts — Drizzle database ที่เกือบทั้งแอปใช้ (และ helper testDb() ด้วย)
// Node: แคช 1 ตัวต่อ URL บน globalThis (pool 10) · Cloudflare + HYPERDRIVE: สร้างใหม่ทุกครั้ง ไม่แคช (pool 1)
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import type { Database } from "@/db/client";

// ห้าม import { getDb } แบบปกติ: tests/setup/per-file.ts → helpers/db.ts import "@/db/client" ไว้แล้ว
// ก่อนที่ vi.mock ด้านล่างจะมีผล → โมดูลนั้นถือ @opennextjs/cloudflare ตัวจริง (mock ไม่ถึง)
// จึง reset แล้ว import ใหม่ใน beforeAll → ได้ client.ts ที่ใช้ mock (แคชบน globalThis ยังเป็นตัวเดียวกับ helper)
let getDb: () => Database;
beforeAll(async () => {
  vi.resetModules();
  ({ getDb } = await import("@/db/client"));
});

// vi.mock ถูกย้ายไปบนสุดของไฟล์ → เก็บพฤติกรรมของ mock ไว้ใน vi.hoisted แล้วเปลี่ยนในแต่ละ test
const mocks = vi.hoisted(() => ({
  // ค่าเริ่มต้น: เหมือนรันใน Node/next dev — getCloudflareContext() โยน error
  getCloudflareContext: (): { env: unknown } => {
    throw new Error("not running on Cloudflare");
  },
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => mocks.getCloudflareContext(),
}));

const notOnCloudflare = mocks.getCloudflareContext;
const onCloudflare = (env: unknown) => {
  mocks.getCloudflareContext = () => ({ env });
};

// drizzle() แนบ postgres-js client ไว้ที่ $client แต่ type Database ไม่ได้ประกาศไว้ (แบบเดียวกับ helpers/db.ts)
type PgClient = {
  options: { host: string[]; database: string; max: number };
  end(options?: { timeout?: number }): Promise<void>;
};
const pg = (db: Database) => (db as Database & { $client: PgClient }).$client;

async function currentDatabase(db: Database) {
  const rows = await db.execute<{ name: string }>(sql`select current_database() as name`);
  return rows[0].name;
}

/** เปลี่ยน DATABASE_URL ชั่วคราว แล้วคืนค่าเดิมเสมอ (แม้ test จะ fail) */
async function withDatabaseUrl<T>(value: string | undefined, run: () => T | Promise<T>): Promise<T> {
  const saved = process.env.DATABASE_URL;
  if (value === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = value;
  try {
    return await run();
  } finally {
    process.env.DATABASE_URL = saved;
  }
}

// db ของ Hyperdrive ไม่อยู่ในแคช → closeDbConnections() ไม่ปิดให้ ต้องปิดเอง
// (db ของ Node อยู่ในแคช helper ปิดให้ตอนจบไฟล์ — test นี้จึงไม่แตะแคชเลย)
const uncached: Database[] = [];

afterEach(() => {
  mocks.getCloudflareContext = notOnCloudflare;
});

afterAll(async () => {
  await Promise.all(uncached.map((db) => pg(db).end({ timeout: 5 })));
});

// URL ปลอม: postgres() ไม่ต่อจริงจนกว่าจะยิง query
const HYPERDRIVE_URL = "postgres://hd_user:hd_pass@hyperdrive.local:5432/hyperdrive_test";

describe("getDb", () => {
  test("ไม่ได้อยู่บน Cloudflare → ใช้ DATABASE_URL ต่อ cmlearn_test จริง ด้วย pool ขนาด 10", async () => {
    const db = getDb();
    expect(await currentDatabase(db)).toBe("cmlearn_test");
    expect(pg(db).options.max).toBe(10);
  });

  test("เรียกซ้ำ → ได้ db ตัวเดิม (ไม่เปิด pool ใหม่)", () => {
    expect(getDb()).toBe(getDb());
  });

  test("DATABASE_URL เปลี่ยน → แคชแยกตาม URL แต่ยังต่อ cmlearn_test", async () => {
    const original = getDb();
    const otherUrl = new URL(process.env.DATABASE_URL!);
    otherUrl.searchParams.set("application_name", "cmlearn_cache_test");

    await withDatabaseUrl(otherUrl.toString(), async () => {
      const other = getDb();
      expect(other).not.toBe(original);
      expect(getDb()).toBe(other); // URL ใหม่ก็ถูกแคชเหมือนกัน
      expect(await currentDatabase(other)).toBe("cmlearn_test");
    });

    expect(getDb()).toBe(original); // กลับมา URL เดิม → ตัวเดิม
  });

  test("อยู่บน Cloudflare และมี HYPERDRIVE → สร้างใหม่ทุกครั้ง (ไม่แคช) ด้วย pool ขนาด 1", () => {
    const local = getDb();
    onCloudflare({ HYPERDRIVE: { connectionString: HYPERDRIVE_URL } });

    const first = getDb();
    const second = getDb();
    uncached.push(first, second);

    expect(first).not.toBe(second);
    expect(first).not.toBe(local);
    expect(pg(first).options.host).toEqual(["hyperdrive.local"]);
    expect(pg(first).options.database).toBe("hyperdrive_test");
    expect(pg(first).options.max).toBe(1);
  });

  test("อยู่บน Cloudflare แต่ไม่มี HYPERDRIVE → fallback ไป DATABASE_URL (ตัวเดิมจากแคช)", () => {
    const local = getDb();
    onCloudflare({});
    expect(getDb()).toBe(local);
  });

  test("มี HYPERDRIVE แต่ connectionString ว่าง → fallback ไป DATABASE_URL (ตัวเดิมจากแคช)", () => {
    const local = getDb();
    onCloudflare({ HYPERDRIVE: { connectionString: "" } });
    expect(getDb()).toBe(local);
  });

  test("ไม่มีทั้ง HYPERDRIVE และ DATABASE_URL → error บอกวิธีตั้งค่า", async () => {
    await withDatabaseUrl(undefined, () => {
      // getDb() เป็นฟังก์ชันธรรมดา (ไม่ใช่ async) → ใช้ toThrow ไม่ใช่ rejects
      expect(() => getDb()).toThrow(
        "Set DATABASE_URL locally or configure the HYPERDRIVE binding on Cloudflare.",
      );
    });
  });

  // วางไว้ท้ายไฟล์: หลัง resetModules โมดูลที่ import ใหม่จะเป็นคนละตัวกับที่ import ไว้ด้านบน
  test("จำลอง hot-reload (โหลดโมดูลใหม่) → ยังได้ db ตัวเดิม เพราะแคชอยู่บน globalThis", async () => {
    const before = getDb();

    vi.resetModules();
    const reloaded = await import("@/db/client");

    expect(reloaded.getDb).not.toBe(getDb); // เป็นโมดูลใหม่จริง
    expect(reloaded.getDb()).toBe(before);
  });
});
