"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Icon from "@/components/ui/Icon";
import { api, AVATAR_ACCEPT, AVATAR_MAX_BYTES, errorText, initials, jsonInit, type Profile } from "@/lib/api-client";

// Edit profile → PATCH /api/v1/users/me (name, bio, remove picture), POST /api/v1/users/me/avatar
export default function EditProfilePage() {
  const router = useRouter();
  const { refetch } = authClient.useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Profile>("/api/v1/users/me").then((result) => {
      if (result.ok) setProfile(result.data);
      else if (result.status === 401) router.replace("/login");
      else setError(errorText(result.error));
    });
  }, [router]);

  // Free the local preview URL when it is replaced or the page closes.
  useEffect(() => () => void (avatarPreview && URL.revokeObjectURL(avatarPreview)), [avatarPreview]);

  const pickAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    setError("");
    const file = event.target.files?.[0] ?? null;
    if (file && file.size > AVATAR_MAX_BYTES) return setError("รูปโปรไฟล์ต้องมีขนาดไม่เกิน 2 MB");
    setAvatarFile(file);
    setAvatarPreview(file ? URL.createObjectURL(file) : null);
    setRemoveAvatar(false);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);

    // 1) name + bio (+ remove picture)
    const body: Record<string, unknown> = { name: String(form.get("name") ?? ""), bio: String(form.get("bio") ?? "") };
    if (removeAvatar) body.image = null;
    const saved = await api<Profile>("/api/v1/users/me", jsonInit("PATCH", body));
    if (!saved.ok) {
      setBusy(false);
      return setError(errorText(saved.error));
    }

    // 2) new picture, if one was chosen
    if (avatarFile) {
      const upload = new FormData();
      upload.set("file", avatarFile);
      const uploaded = await api<Profile>("/api/v1/users/me/avatar", { method: "POST", body: upload });
      if (!uploaded.ok) {
        setBusy(false);
        return setError(`บันทึกชื่อแล้ว แต่อัปโหลดรูปไม่สำเร็จ: ${errorText(uploaded.error)}`);
      }
    }

    await refetch(); // the navbar shows the name/picture from the session
    router.push("/profile");
    router.refresh();
  };

  const shownImage = avatarPreview ?? (removeAvatar ? null : profile?.image ?? null);

  return (
    <main className="site-frame">
      <Navbar />
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
        {error && <p className="auth-error" role="alert">{error}</p>}
        {!profile ? (
          !error && <p>กำลังโหลดข้อมูล...</p>
        ) : (
          <form className="edit-layout" onSubmit={save}>
            <aside className="edit-file">
              <div className="profile-avatar" style={shownImage ? { overflow: "hidden", padding: 0 } : undefined}>
                {shownImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local preview or avatar URL
                  <img src={shownImage} alt="รูปโปรไฟล์" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  initials(profile.name)
                )}
              </div>
              <label className="secondary-button" style={{ cursor: "pointer" }}>
                <Icon name="cloud-upload" size={15} /> {avatarFile ? "เปลี่ยนรูปอีกครั้ง" : "เลือกรูปใหม่"}
                <input type="file" accept={AVATAR_ACCEPT} hidden onChange={pickAvatar} />
              </label>
              {(profile.image || avatarFile) && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setAvatarFile(null);
                    setAvatarPreview(null);
                    setRemoveAvatar(Boolean(profile.image));
                  }}
                >
                  <Icon name="trash" size={14} /> ลบรูป
                </button>
              )}
              <small style={{ color: "#8b97a9", textAlign: "center" }}>PNG, JPG, WEBP ไม่เกิน 2 MB</small>
            </aside>
            <section className="edit-fields">
              <label htmlFor="profile-name">ชื่อที่แสดง *</label>
              <input id="profile-name" name="name" defaultValue={profile.name} required maxLength={100} />
              <label htmlFor="profile-bio">แนะนำตัว</label>
              <textarea id="profile-bio" name="bio" defaultValue={profile.bio ?? ""} maxLength={500} placeholder="เช่น ชอบสรุปวิชาคณิตศาสตร์และคอมพิวเตอร์" />
              <label>อีเมล</label>
              <input value={profile.email} readOnly disabled />
              <div className="edit-actions">
                <Link className="secondary-button" href="/profile">
                  <Icon name="arrow-left" size={14} /> ยกเลิก
                </Link>
                <button className="action-button" disabled={busy}>
                  <Icon name="save" size={15} /> {busy ? "กำลังบันทึก..." : "บันทึกโปรไฟล์"}
                </button>
              </div>
            </section>
          </form>
        )}
      </section>
      <Footer />
    </main>
  );
}
