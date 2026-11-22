import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { subject, summary } from "@/db/schema";

export const runtime = "nodejs";

async function getSignedInUser() {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

function parseTags(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

function isSupportedFile(file: File) {
  return /\.(pdf|docx?|pptx?)$/i.test(file.name);
}

export async function GET() {
  try {
    const user = await getSignedInUser();
    if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });

    const db = await getDb();
    const rows = await db.select({
      id: summary.id,
      title: summary.title,
      description: summary.content,
      category: summary.category,
      tags: summary.tags,
      fileName: summary.fileName,
      fileSize: summary.fileSize,
      fileType: summary.fileType,
      subjectId: subject.id,
      isPublished: subject.isPublished,
      visibility: subject.visibility,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
    }).from(summary).innerJoin(subject, eq(summary.subjectId, subject.id)).where(eq(subject.ownerId, user.id)).orderBy(summary.createdAt);

    return NextResponse.json({ sheets: rows.map((row) => ({ ...row, tags: parseTags(row.tags) })) });
  } catch (error) {
    console.error("GET /api/sheets failed", error);
    return NextResponse.json({ error: "โหลดชีตไม่สำเร็จ ตรวจสอบการเชื่อมต่อฐานข้อมูล" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSignedInUser();
    if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });

    const form = await request.formData();
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const category = String(form.get("category") ?? "").trim();
    const tags = form.getAll("tags").filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean);
    const file = form.get("file");
    if (!title || !category || !(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "กรุณากรอกชื่อชีต เลือกวิชา และเลือกไฟล์" }, { status: 400 });
    }
    if (!isSupportedFile(file)) return NextResponse.json({ error: "รองรับเฉพาะไฟล์ PDF, DOCX และ PPTX" }, { status: 415 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "ไฟล์ต้องมีขนาดไม่เกิน 10 MB" }, { status: 413 });

    const fileName = file.name.replace(/[\\/\r\n\0]/g, "_").slice(0, 180);
    const fileType = file.type || "application/octet-stream";
    const fileData = Buffer.from(await file.arrayBuffer()).toString("base64");
    const db = await getDb();
    const subjectId = crypto.randomUUID();
    const sheetId = crypto.randomUUID();

    await db.transaction(async (tx) => {
      await tx.insert(subject).values({ id: subjectId, ownerId: user.id, title: category, description: null, isPublished: false, visibility: "private" });
      await tx.insert(summary).values({
        id: sheetId,
        subjectId,
        title,
        content: description,
        category,
        tags: JSON.stringify(tags),
        fileName,
        fileType,
        fileSize: file.size,
        fileData,
      });
    });

    return NextResponse.json({ id: sheetId, title, description, category, tags, fileName, fileSize: file.size, isPublished: false }, { status: 201 });
  } catch (error) {
    console.error("POST /api/sheets failed", error);
    return NextResponse.json({ error: "บันทึกชีตไม่สำเร็จ ตรวจสอบการเชื่อมต่อฐานข้อมูล" }, { status: 503 });
  }
}
