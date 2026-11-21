"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const MIN_PASSWORD_LENGTH = 8; // must match emailAndPassword.minPasswordLength in src/lib/auth.ts

// Functional skeleton for FE02: logic is done, styling (CSS/Tailwind) is left to FE.
export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name")).trim();
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    const confirmPassword = String(form.get("confirmPassword"));

    // Quick checks for a nicer UX. The server checks again; never trust only the client.
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`);
      return;
    }
    if (password !== confirmPassword) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }

    setLoading(true);
    const { error } = await authClient.signUp.email({ name, email, password });
    setLoading(false);

    if (error) {
      const messages: Record<string, string> = {
        USER_ALREADY_EXISTS: "อีเมลนี้ถูกใช้สมัครแล้ว",
        USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "อีเมลนี้ถูกใช้สมัครแล้ว",
        PASSWORD_TOO_SHORT: `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`,
        INVALID_EMAIL: "รูปแบบอีเมลไม่ถูกต้อง",
      };
      setError((error.code && messages[error.code]) ?? error.message ?? "สมัครสมาชิกไม่สำเร็จ");
      return;
    }

    // autoSignIn is on (src/lib/auth.ts), so the user is already logged in here.
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main>
      <Link href="/">← CM Learn</Link>
      <h1>สมัครสมาชิก</h1>

      {/* method="post": if JS has not loaded yet, the browser must never put the password in the URL (GET). */}
      <form method="post" onSubmit={handleSubmit}>
        <label>
          ชื่อที่แสดง
          <input name="name" type="text" autoComplete="name" required />
        </label>
        <label>
          อีเมล
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          รหัสผ่าน
          <input name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
        </label>
        <label>
          ยืนยันรหัสผ่าน
          <input name="confirmPassword" type="password" autoComplete="new-password" required />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? "กำลังสมัคร..." : "สมัครสมาชิก"}
        </button>
      </form>

      <p>
        มีบัญชีแล้ว? <Link href="/login">เข้าสู่ระบบ</Link>
      </p>
    </main>
  );
}
