"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import Icon from "@/components/ui/Icon";

export default function EditProfilePage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (session?.user.name) setName(session.user.name);
  }, [session?.user.name]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await authClient.updateUser({ name: name.trim() });
      if (result.error)
        throw new Error(result.error.message || "บันทึกโปรไฟล์ไม่สำเร็จ");
      router.push("/profile");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "บันทึกโปรไฟล์ไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="site-frame">
      <section className="page-surface">
        <div className="section-heading">
          <h1 className="section-title">
            <span>
              แก้ไขโปรไฟล์<small>อัปเดตข้อมูลบัญชีของคุณ</small>
            </span>
          </h1>
          <Link className="secondary-button" href="/profile">
            ยกเลิก
          </Link>
        </div>
        {isPending ? (
          <p>กำลังโหลดข้อมูล...</p>
        ) : (
          <form className="edit-fields" onSubmit={save}>
            <label htmlFor="profile-name">ชื่อที่แสดง</label>
            <input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
            />
            <label>อีเมล</label>
            <input value={session?.user.email ?? ""} readOnly disabled />
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <button className="action-button" disabled={busy}>
              <Icon name="save" size={15} />{" "}
              {busy ? "กำลังบันทึก..." : "บันทึกโปรไฟล์"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
