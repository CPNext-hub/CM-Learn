import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { subject, summary } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const auth = await getAuth();
    const user = (await auth.api.getSession({ headers: await headers() }))?.user;
    if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });
    const { id } = await params;
    const db = await getDb();
    const [row] = await db.select({ fileData: summary.fileData, fileName: summary.fileName, fileType: summary.fileType })
      .from(summary).innerJoin(subject, eq(summary.subjectId, subject.id)).where(and(eq(summary.id, id), eq(subject.ownerId, user.id))).limit(1);
    if (!row?.fileData) return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 404 });
    const bytes = Buffer.from(row.fileData, "base64");
    const safeName = (row.fileName ?? "sheet").replace(/["\\\r\n]/g, "_");
    const disposition = row.fileType === "application/pdf" ? "inline" : "attachment";
    return new Response(bytes, { headers: { "Content-Type": row.fileType ?? "application/octet-stream", "Content-Disposition": disposition + "; filename=\"" + safeName + "\"", "Content-Length": String(bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    console.error("GET /api/sheets/[id]/file failed", error);
    return NextResponse.json({ error: "เปิดไฟล์ไม่สำเร็จ ตรวจสอบการเชื่อมต่อฐานข้อมูล" }, { status: 503 });
  }
}
