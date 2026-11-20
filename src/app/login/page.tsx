"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

// Functional skeleton for FE02: logic is done, styling (CSS/Tailwind) is left to FE.
export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });

    setLoading(false);
    if (error) {
      setError(
        error.code === "INVALID_EMAIL_OR_PASSWORD"
          ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
          : (error.message ?? "เข้าสู่ระบบไม่สำเร็จ"),
      );
      return;
    }
    router.push("/dashboard");
    router.refresh(); // re-run server components so they see the new session cookie
  }

  const signInSocial = (provider: "google" | "facebook") =>
    authClient.signIn.social({ provider, callbackURL: "/dashboard" });

  return (
    <main>
      <Link href="/">← CM Learn</Link>
      <h1>เข้าสู่ระบบ</h1>

      {/* method="post": if JS has not loaded yet, the browser must never put the password in the URL (GET). */}
      <form method="post" onSubmit={handleSubmit}>
        <label>
          อีเมล
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          รหัสผ่าน
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>

      <p>
        ยังไม่มีบัญชี? <Link href="/register">สมัครสมาชิก</Link>
      </p>

      <p>หรือ</p>
      <button type="button" onClick={() => signInSocial("google")}>ดำเนินการต่อด้วย Google</button>
      <button type="button" onClick={() => signInSocial("facebook")}>ดำเนินการต่อด้วย Facebook</button>
    </main>
  );
}
