import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { subject, summary } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

function isSupportedFile(file: File) {
  return /\.(pdf|docx?|pptx?)$/i.test(file.name);
}

async function signedInUser() {
  const auth = await getAuth();
  return (await auth.api.getSession({ headers: await headers() }))?.user ?? null;
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await signedInUser();
    if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });
    const { id } = await params;
    const db = await getDb();
    const [row] = await db.select({ id: summary.id, title: summary.title, description: summary.content, category: summary.category, tags: summary.tags, fileName: summary.fileName, fileSize: summary.fileSize, fileType: summary.fileType, isPublished: subject.isPublished, visibility: subject.visibility })
      .from(summary).innerJoin(subject, eq(summary.subjectId, subject.id)).where(and(eq(summary.id, id), eq(subject.ownerId, user.id))).limit(1);
    if (!row) return NextResponse.json({ error: "ไม่พบชีตนี้" }, { status: 404 });
    let tags: string[] = [];
    try { const parsed: unknown = JSON.parse(row.tags); if (Array.isArray(parsed)) tags = parsed.filter((tag): tag is string => typeof tag === "string"); } catch { /* legacy malformed tags */ }
    return NextResponse.json({ sheet: { ...row, tags } });
  } catch (error) {
    console.error("GET /api/sheets/[id] failed", error);
    return NextResponse.json({ error: "โหลดชีตไม่สำเร็จ ตรวจสอบการเชื่อมต่อฐานข้อมูล" }, { status: 503 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await signedInUser();
    if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });
    const { id } = await params;
    const form = await request.formData();
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const category = String(form.get("category") ?? "").trim();
    const visibility = String(form.get("visibility") ?? "private");
    if (!["public", "members", "private"].includes(visibility)) return NextResponse.json({ error: "ระดับการเผยแพร่ไม่ถูกต้อง" }, { status: 400 });
    const tags = form.getAll("tags").filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean);
    const file = form.get("file");
    if (!title || !category) return NextResponse.json({ error: "ชื่อชีตและหมวดหมู่เป็นข้อมูลที่จำเป็น" }, { status: 400 });
    if (file instanceof File && file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "ไฟล์ต้องมีขนาดไม่เกิน 10 MB" }, { status: 413 });
    if (file instanceof File && file.size > 0 && !isSupportedFile(file)) return NextResponse.json({ error: "รองรับเฉพาะไฟล์ PDF, DOCX และ PPTX" }, { status: 415 });
    const db = await getDb();
    const [existing] = await db.select({ subjectId: subject.id }).from(summary).innerJoin(subject, eq(summary.subjectId, subject.id)).where(and(eq(summary.id, id), eq(subject.ownerId, user.id))).limit(1);
    if (!existing) return NextResponse.json({ error: "ไม่พบชีตนี้" }, { status: 404 });
    const values: Partial<typeof summary.$inferInsert> = { title, content: description, category, tags: JSON.stringify(tags), updatedAt: new Date() };
    if (file instanceof File && file.size > 0) {
      values.fileName = file.name.replace(/[\\/\r\n\0]/g, "_").slice(0, 180);
      values.fileType = file.type || "application/octet-stream";
      values.fileSize = file.size;
      values.fileData = Buffer.from(await file.arrayBuffer()).toString("base64");
    }
    await db.transaction(async (tx) => {
      await tx.update(summary).set(values).where(eq(summary.id, id));
      await tx.update(subject).set({ title: category, isPublished: visibility === "public", visibility, updatedAt: new Date() }).where(eq(subject.id, existing.subjectId));
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/sheets/[id] failed", error);
    return NextResponse.json({ error: "บันทึกการแก้ไขไม่สำเร็จ ตรวจสอบการเชื่อมต่อฐานข้อมูล" }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await signedInUser();
    if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });
    const { id } = await params;
    const db = await getDb();
    const [existing] = await db.select({ subjectId: subject.id }).from(summary).innerJoin(subject, eq(summary.subjectId, subject.id)).where(and(eq(summary.id, id), eq(subject.ownerId, user.id))).limit(1);
    if (!existing) return NextResponse.json({ error: "ไม่พบชีตนี้" }, { status: 404 });
    await db.transaction(async (tx) => {
      await tx.delete(summary).where(eq(summary.id, id));
      const remaining = await tx.select({ id: summary.id }).from(summary).where(eq(summary.subjectId, existing.subjectId)).limit(1);
      if (!remaining.length) await tx.delete(subject).where(eq(subject.id, existing.subjectId));
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/sheets/[id] failed", error);
    return NextResponse.json({ error: "ลบชีตไม่สำเร็จ ตรวจสอบการเชื่อมต่อฐานข้อมูล" }, { status: 503 });
  }
}
