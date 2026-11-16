"use client";

import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const signIn = (provider: "google" | "facebook") => authClient.signIn.social({ provider, callbackURL: "/dashboard" });
  return <main className="grid min-h-screen place-items-center px-6"><section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
    <a href="/" className="text-sm font-semibold text-indigo-600">← CM Learn</a>
    <h1 className="mt-7 text-2xl font-bold">เข้าสู่ระบบ</h1><p className="mt-2 text-sm text-slate-600">ใช้บัญชี Google หรือ Facebook เพื่อเข้าใช้งาน</p>
    <div className="mt-7 grid gap-3">
      <button onClick={() => signIn("google")} className="rounded-lg border border-slate-300 px-4 py-3 font-medium hover:bg-slate-50">ดำเนินการต่อด้วย Google</button>
      <button onClick={() => signIn("facebook")} className="rounded-lg border border-slate-300 px-4 py-3 font-medium hover:bg-slate-50">ดำเนินการต่อด้วย Facebook</button>
    </div>
    <p className="mt-6 text-xs leading-5 text-slate-500">การเข้าสู่ระบบแสดงว่าคุณยอมรับเงื่อนไขการใช้งานและนโยบายความเป็นส่วนตัว</p>
  </section></main>;
}
