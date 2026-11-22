"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { ErrorBox } from "../_components";
import { api, formatDate, type ApiErrorBody } from "../_lib";

type Profile = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  bio: string | null;
  role: string;
  createdAt: string;
  stats: { sheetCount: number; publishedCount: number; totalViews: number; likeCount: number };
};

// Profile → GET/PATCH /api/v1/users/me and POST /api/v1/users/me/avatar
export default function TestProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<{ body: ApiErrorBody; status: number } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const { refetch } = authClient.useSession();

  useEffect(() => {
    api<Profile>("/api/v1/users/me").then((result) => {
      if (result.ok) setProfile(result.data);
      else setError({ body: result.error, status: result.status });
    });
  }, []);

  // Free the local preview URL when it is replaced or the page closes.
  useEffect(() => () => void (avatarPreview && URL.revokeObjectURL(avatarPreview)), [avatarPreview]);

  async function run(promise: ReturnType<typeof api<Profile>>, done: string) {
    setBusy(true);
    setMessage("");
    const result = await promise;
    setBusy(false);
    if (result.ok) {
      setProfile(result.data);
      setError(null);
      setMessage(`✅ ${done} (HTTP ${result.status})`);
      refetch(); // the top bar shows the name from the session
    } else {
      setError({ body: result.error, status: result.status });
    }
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = { name: String(form.get("name") ?? ""), bio: String(form.get("bio") ?? "") };
    run(
      api<Profile>("/api/v1/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      "บันทึกโปรไฟล์แล้ว",
    );
  }

  function handlePickAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setAvatarFile(file);
    setAvatarPreview(file ? URL.createObjectURL(file) : null);
  }

  function handleUploadAvatar() {
    if (!avatarFile) return;
    const form = new FormData();
    form.append("file", avatarFile);
    run(api<Profile>("/api/v1/users/me/avatar", { method: "POST", body: form }), "อัปโหลดรูปโปรไฟล์แล้ว").then(() => {
      setAvatarFile(null);
      setAvatarPreview(null);
    });
  }

  function handleRemoveAvatar() {
    run(
      api<Profile>("/api/v1/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: null }),
      }),
      "ลบรูปโปรไฟล์แล้ว",
    );
  }

  if (!profile) {
    return (
      <main>
        <h1>โปรไฟล์ของฉัน</h1>
        {error ? <ErrorBox error={error.body} status={error.status} /> : <p>กำลังโหลด...</p>}
      </main>
    );
  }

  return (
    <main>
      <h1>โปรไฟล์ของฉัน</h1>
      {profile.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- test page, plain <img> is fine
        <img src={profile.image} alt="รูปโปรไฟล์" width={96} height={96} style={{ objectFit: "cover" }} />
      ) : (
        <p>(ยังไม่มีรูปโปรไฟล์)</p>
      )}
      <table border={1} cellPadding={4} style={{ borderCollapse: "collapse" }}>
        <tbody>
          <tr><th align="left">ชื่อที่แสดง</th><td>{profile.name}</td></tr>
          <tr><th align="left">อีเมล</th><td>{profile.email}</td></tr>
          <tr><th align="left">แนะนำตัว</th><td style={{ whiteSpace: "pre-wrap" }}>{profile.bio ?? "-"}</td></tr>
          <tr><th align="left">role</th><td>{profile.role}</td></tr>
          <tr><th align="left">สมัครเมื่อ</th><td>{formatDate(profile.createdAt)}</td></tr>
          <tr>
            <th align="left">สถิติ</th>
            <td>
              ชีท {profile.stats.sheetCount} (เผยแพร่ {profile.stats.publishedCount}) · ยอดดูรวม {profile.stats.totalViews} ·
              ถูกใจ {profile.stats.likeCount}
            </td>
          </tr>
          <tr><th align="left">image (URL)</th><td><code>{profile.image ?? "null"}</code></td></tr>
        </tbody>
      </table>

      {message && <p>{message}</p>}
      <ErrorBox error={error?.body ?? null} status={error?.status} />

      <h2>แก้ไขข้อมูล</h2>
      <form onSubmit={handleSave} key={profile.name + (profile.bio ?? "") /* reset after save */}>
        <p>
          <label>ชื่อที่แสดง* <input name="name" defaultValue={profile.name} maxLength={100} size={40} /></label>
        </p>
        <p>
          <label>
            แนะนำตัว (ไม่เกิน 500 ตัวอักษร)
            <br />
            <textarea name="bio" defaultValue={profile.bio ?? ""} rows={3} cols={60} />
          </label>
        </p>
        <button type="submit" disabled={busy}>บันทึก</button>
      </form>

      <h2>รูปโปรไฟล์</h2>
      <p>
        <label>
          เลือกรูป (PNG, JPG, WEBP ไม่เกิน 2 MB){" "}
          <input type="file" accept=".png,.jpg,.jpeg,.webp" onChange={handlePickAvatar} />
        </label>
      </p>
      {avatarPreview && (
        <p>
          ตัวอย่างก่อนอัปโหลด:
          <br />
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
          <img src={avatarPreview} alt="ตัวอย่างรูป" width={96} height={96} style={{ objectFit: "cover" }} />
        </p>
      )}
      <p>
        <button type="button" disabled={busy || !avatarFile} onClick={handleUploadAvatar}>อัปโหลดรูป</button>{" "}
        <button type="button" disabled={busy || !profile.image} onClick={handleRemoveAvatar}>ลบรูป</button>
      </p>
    </main>
  );
}
