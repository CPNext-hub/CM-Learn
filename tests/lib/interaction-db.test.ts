// src/lib/interaction-db.ts — connection (postgres-js) ที่ route [[...path]] ของ BE02 ใช้ยิง SQL
// เลือก URL: HYPERDRIVE (Cloudflare) ก่อน → ไม่มี/ไม่ได้อยู่บน Cloudflare → DATABASE_URL
// แล้วแคช client ไว้ 1 ตัวต่อ URL
import { afterAll, afterEach, describe, expect, test, vi } from "vitest";
import { getInteractionSql } from "@/lib/interaction-db";

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

// clients ใน interaction-db.ts ไม่ถูกปิดโดย closeDbConnections() (helper ปิดแค่ pool ของ db/client.ts)
// → เก็บทุกตัวที่ test ได้มา แล้วปิดเองตอนจบไฟล์
type Client = Awaited<ReturnType<typeof getInteractionSql>>;
const created = new Set<Client>();
async function getSql() {
  const client = await getInteractionSql();
  created.add(client);
  return client;
}

afterEach(() => {
  mocks.getCloudflareContext = notOnCloudflare;
});

afterAll(async () => {
  await Promise.all([...created].map((client) => client.end({ timeout: 5 })));
});

// URL ปลอม: ต่างจาก DATABASE_URL เสมอ เพื่อไม่ให้ได้ client ตัวเดียวกันจากแคช · postgres() ไม่ต่อจริงจนกว่าจะยิง query
const HYPERDRIVE_URL = "postgres://hd_user:hd_pass@hyperdrive.local:5432/hyperdrive_test";

describe("getInteractionSql", () => {
  test("ไม่ได้อยู่บน Cloudflare → ใช้ DATABASE_URL และต่อ cmlearn_test ได้จริง", async () => {
    const sql = await getSql();
    const [row] = await sql`select current_database() as name`;
    expect(row.name).toBe("cmlearn_test");
  });

  test("เรียกซ้ำด้วย URL เดิม → ได้ client ตัวเดิมจากแคช (ไม่เปิด connection ใหม่)", async () => {
    const first = await getSql();
    const second = await getSql();
    expect(second).toBe(first);
  });

  test("อยู่บน Cloudflare และมี HYPERDRIVE → ใช้ connectionString ของ Hyperdrive", async () => {
    const local = await getSql();
    onCloudflare({ HYPERDRIVE: { connectionString: HYPERDRIVE_URL } });

    const hyperdrive = await getSql();

    expect(hyperdrive).not.toBe(local);
    expect(hyperdrive.options.host).toEqual(["hyperdrive.local"]);
    expect(hyperdrive.options.database).toBe("hyperdrive_test");
    expect(hyperdrive.options.max).toBe(1);
    // Hyperdrive ก็ใช้แคชเหมือนกัน
    expect(await getSql()).toBe(hyperdrive);
  });

  test("อยู่บน Cloudflare แต่ไม่มี HYPERDRIVE → fallback ไป DATABASE_URL", async () => {
    onCloudflare({});
    const sql = await getSql();
    const [row] = await sql`select current_database() as name`;
    expect(row.name).toBe("cmlearn_test");
  });

  test("มี HYPERDRIVE แต่ connectionString ว่าง → fallback ไป DATABASE_URL", async () => {
    onCloudflare({ HYPERDRIVE: { connectionString: "" } });
    const sql = await getSql();
    const [row] = await sql`select current_database() as name`;
    expect(row.name).toBe("cmlearn_test");
  });

  test("ไม่มีทั้ง HYPERDRIVE และ DATABASE_URL → error บอกวิธีตั้งค่า", async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(getInteractionSql()).rejects.toThrow("Set DATABASE_URL or configure the HYPERDRIVE binding.");
    } finally {
      process.env.DATABASE_URL = saved;
    }
  });
});
