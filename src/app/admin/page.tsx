import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.role !== "admin") redirect("/dashboard");
  return <main className="mx-auto min-h-screen max-w-5xl px-6 py-10"><p className="text-sm font-semibold text-indigo-600">Admin</p><h1 className="mt-2 text-3xl font-bold">จัดการระบบ</h1><p className="mt-3 text-slate-600">พื้นที่สำหรับจัดการผู้ใช้ วิชา และเนื้อหา</p></main>;
}
