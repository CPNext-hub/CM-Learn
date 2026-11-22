"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import { authClient } from "@/lib/auth-client";

type AuthMode = "login" | "register";

export default function AuthCarousel({ initialMode }: { initialMode: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const syncWithUrl = () => setMode(window.location.pathname === "/register" ? "register" : "login");
    window.addEventListener("popstate", syncWithUrl);
    return () => window.removeEventListener("popstate", syncWithUrl);
  }, []);

  const switchMode = (nextMode: AuthMode) => {
    setError("");
    setMode(nextMode);
    window.history.pushState({}, "", nextMode === "register" ? "/register" : "/login");
  };

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!email || !password) return setError("กรุณากรอกอีเมลและรหัสผ่าน");
    if (mode === "register") {
      const name = String(form.get("name") ?? "").trim();
      if (!name) return setError("กรุณากรอกชื่อที่ใช้");
      if (password !== String(form.get("confirmPassword") ?? "")) return setError("รหัสผ่านยืนยันไม่ตรงกัน");
    }
    setBusy(true);
    try {
      const result = mode === "login"
        ? await authClient.signIn.email({ email, password, rememberMe: Boolean(form.get("remember")), callbackURL: "/my-sheets" })
        : await authClient.signUp.email({ email, password, name: String(form.get("name")).trim(), callbackURL: "/my-sheets" });
      if (result.error) throw new Error(result.error.message || "เข้าสู่ระบบไม่สำเร็จ");
      router.push("/my-sheets");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className={`auth-surface auth-centered ${mode === "register" ? "is-register" : ""}`}>
        <AuthIllustration mode={mode} key={mode} />
        <div className="auth-form-window">
          {mode === "login" ? (
            <form className="auth-card" key="login" onSubmit={submitAuth}>
              <h1>เข้าสู่ระบบ</h1>
              <label className="field"><Icon name="mail" size={15} /><input name="email" type="email" autoComplete="email" placeholder="อีเมลของคุณ" required /></label>
              <label className="field"><Icon name="lock" size={15} /><input name="password" type="password" autoComplete="current-password" placeholder="รหัสผ่าน" required /></label>
              <div className="auth-options"><label className="check-label"><input name="remember" type="checkbox" /> จดจำการเข้าสู่ระบบ</label><span className="text-link" title="ระบบยังไม่ได้ตั้งค่าอีเมลสำหรับรีเซ็ตรหัสผ่าน">ลืมรหัสผ่าน?</span></div>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="primary-button" type="submit" disabled={busy}>{busy ? "กำลังดำเนินการ..." : "เข้าสู่ระบบ"} <Icon name="arrow-right" size={16} /></button>
              <p className="auth-note">หรือ</p>
              <p className="auth-bottom">ยังไม่มีบัญชี? <a className="text-link" href="/register" onClick={(event) => { event.preventDefault(); switchMode("register"); }}>สมัครสมาชิก</a></p>
            </form>
          ) : (
            <form className="auth-card" key="register" onSubmit={submitAuth}>
              <h1>สมัครสมาชิก</h1>
              <label className="field"><Icon name="user" size={15} /><input name="name" type="text" autoComplete="name" placeholder="ชื่อที่ใช้" required /></label>
              <label className="field"><Icon name="mail" size={15} /><input name="email" type="email" autoComplete="email" placeholder="อีเมล" required /></label>
              <label className="field"><Icon name="lock" size={15} /><input name="password" type="password" autoComplete="new-password" minLength={8} placeholder="รหัสผ่าน (อย่างน้อย 8 ตัว)" required /></label>
              <label className="field"><Icon name="lock" size={15} /><input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} placeholder="ยืนยันรหัสผ่าน" required /></label>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="primary-button" type="submit" disabled={busy}>{busy ? "กำลังดำเนินการ..." : "สมัครสมาชิก"} <Icon name="arrow-right" size={16} /></button>
              <p className="auth-bottom">มีบัญชีอยู่แล้ว? <a className="text-link" href="/login" onClick={(event) => { event.preventDefault(); switchMode("login"); }}>เข้าสู่ระบบ</a></p>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

function AuthIllustration({ mode }: { mode: AuthMode }) {
  if (mode === "register") {
    return (
      <div className="auth-art">
        <div className="art-halo"><div className="person-plus"><Icon name="user" size={54} /></div></div>
        <div className="welcome-copy"><h2>สมัครสมาชิกกับ CM HUB</h2><p>เริ่มต้นแบ่งปันชีตต่าง ๆ<br />ในไม่กี่ขั้นตอน</p></div>
      </div>
    );
  }
  return (
    <div className="auth-art">
      <div className="art-halo"><div className="art-document"><span /><span /><span /></div><span className="cap"><Icon name="graduation" size={42} /></span></div>
      <div className="welcome-copy"><h2>ยินดีต้อนรับกลับมา!</h2><p>เข้าสู่ระบบเพื่อเข้าถึงชีตของคุณ<br />และจัดการเนื้อหาของคุณ</p></div>
    </div>
  );
}
