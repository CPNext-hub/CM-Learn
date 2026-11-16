import Link from "next/link";
import { getSession } from "@/lib/session";

export default async function HomePage() {
  const session = await getSession();
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tight">CM Learn</Link>
        {session ? <span className="text-sm text-slate-600">สวัสดี {session.user.name}</span> : <Link className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white" href="/login">เข้าสู่ระบบ</Link>}
      </header>
      <section className="my-auto max-w-2xl py-24">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-indigo-600">เรียนรู้และแบ่งปัน</p>
        <h1 className="text-4xl font-bold leading-tight md:text-6xl">สรุปความรู้ของคุณ<br />ให้ทุกคนเรียนรู้ต่อได้</h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">สร้างวิชา รวบรวมเนื้อหาสำคัญ และเผยแพร่สรุปที่เป็นประโยชน์ให้กับชุมชนผู้เรียน</p>
        <div className="mt-9 flex gap-3">
          {session ? <Link className="rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white" href="/dashboard">ไปยังพื้นที่ของฉัน</Link> : <Link className="rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white" href="/login">เริ่มต้นใช้งาน</Link>}
          <a className="rounded-lg border border-slate-300 px-5 py-3 font-semibold" href="#how">ดูวิธีใช้งาน</a>
        </div>
      </section>
      <section id="how" className="grid gap-4 border-t border-slate-200 py-8 sm:grid-cols-3">
        {["สร้างวิชา", "เขียนสรุป", "แบ่งปันความรู้"].map((item, i) => <div key={item} className="rounded-xl bg-white p-5 shadow-sm"><span className="text-sm font-semibold text-indigo-600">0{i + 1}</span><h2 className="mt-2 font-semibold">{item}</h2></div>)}
      </section>
    </main>
  );
}
