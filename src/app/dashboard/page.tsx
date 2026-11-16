import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
    <p className="text-sm font-semibold text-indigo-600">พื้นที่ผู้ใช้</p><h1 className="mt-2 text-3xl font-bold">สวัสดี {session.user.name}</h1>
    <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <h2 className="text-lg font-semibold">เริ่มสร้างวิชาแรกของคุณ</h2><p className="mt-2 text-slate-600">ระบบจัดการวิชาและสรุปจะเชื่อมต่อกับฐานข้อมูลในขั้นถัดไป</p>
      <button disabled className="mt-5 rounded-lg bg-indigo-300 px-4 py-2 font-semibold text-white">สร้างวิชา (กำลังพัฒนา)</button>
    </div>
  </main>;
}
