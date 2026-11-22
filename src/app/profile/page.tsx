"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Icon from "@/components/ui/Icon";
import LogoutButton from "@/components/auth/LogoutButton";
import { api, errorText, fileLabel, initials, STATUS_LABEL, type Profile, type Sheet } from "@/lib/api-client";

const thaiDate = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });

function timeAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "วันนี้";
  if (days === 1) return "เมื่อวาน";
  return `${days} วันที่แล้ว`;
}

// Profile → GET /api/v1/users/me (+ 3 latest sheets from GET /api/v1/users/me/sheets)
export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recent, setRecent] = useState<Sheet[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Profile>("/api/v1/users/me").then((result) => {
      if (result.ok) setProfile(result.data);
      else if (result.status === 401) router.replace("/login");
      else setError(errorText(result.error));
    });
    api<Sheet[]>("/api/v1/users/me/sheets?pageSize=3").then((result) => result.ok && setRecent(result.data));
  }, [router]);

  return (
    <main className="site-frame">
      <Navbar />
      <section className="page-surface">
        {error && <p className="auth-error" role="alert">{error}</p>}
        {!profile && !error && <div className="empty-state">กำลังโหลดโปรไฟล์...</div>}
        {profile && (
          <>
            <div className="profile-hero">
              <div className="profile-avatar" style={profile.image ? { overflow: "hidden", padding: 0 } : undefined}>
                {profile.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- avatar from our API or an OAuth provider
                  <img src={profile.image} alt={profile.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  initials(profile.name)
                )}
              </div>
              <div style={{ flex: 1 }}>
                <h1 className="profile-name">{profile.name}</h1>
                <p className="profile-handle">{profile.email}</p>
                {profile.role === "admin" && <span className="tag">ผู้ดูแลระบบ</span>}
                <p className="profile-bio">{profile.bio ?? "ยังไม่ได้เขียนแนะนำตัว"}</p>
              </div>
              <Link className="secondary-button" href="/profile/edit">
                <Icon name="edit" size={14} /> แก้ไขโปรไฟล์
              </Link>
            </div>
            <div className="profile-stats">
              <div className="stat">
                <Icon className="stat-icon" name="file" size={17} />
                <strong>{profile.stats.sheetCount}</strong>
                <span>ชีตทั้งหมด (เผยแพร่ {profile.stats.publishedCount})</span>
              </div>
              <div className="stat">
                <Icon className="stat-icon" name="eye" size={17} />
                <strong>{profile.stats.totalViews}</strong>
                <span>ยอดเข้าชม</span>
              </div>
              <div className="stat">
                <Icon className="stat-icon" name="heart" size={17} />
                <strong>{profile.stats.likeCount}</strong>
                <span>ถูกใจ</span>
              </div>
            </div>
            <div className="profile-columns">
              <section className="panel">
                <h3>
                  <Icon name="user" size={16} /> ข้อมูลส่วนตัว
                </h3>
                <div className="info-row">
                  <span className="info-label">
                    <Icon name="user" size={14} /> ชื่อที่แสดง
                  </span>
                  <strong>{profile.name}</strong>
                </div>
                <div className="info-row">
                  <span className="info-label">
                    <Icon name="mail" size={14} /> อีเมล
                  </span>
                  <strong>{profile.email}</strong>
                </div>
                <div className="info-row">
                  <span className="info-label">
                    <Icon name="calendar" size={14} /> วันที่สมัคร
                  </span>
                  <strong>{thaiDate(profile.createdAt)}</strong>
                </div>
              </section>
              <section className="panel">
                <h3>
                  ชีตล่าสุด{" "}
                  <Link className="text-link" href="/my-sheets" style={{ float: "right", fontSize: 10 }}>
                    ดูทั้งหมด →
                  </Link>
                </h3>
                {recent.length === 0 && <p className="profile-bio">ยังไม่มีชีต</p>}
                {recent.map((sheet) => (
                  <Link className="activity" key={sheet.id} href={`/my-sheets/${sheet.id}/edit`}>
                    <span className="mini-pdf">{sheet.file ? fileLabel(sheet.file.mimeType) : "ร่าง"}</span>
                    <div>
                      <strong>{sheet.title}</strong>
                      <small>
                        {STATUS_LABEL[sheet.status]} · {timeAgo(sheet.createdAt)}
                      </small>
                    </div>
                    <Icon className="activity-arrow" name="arrow-right" size={15} />
                  </Link>
                ))}
              </section>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <LogoutButton />
            </div>
          </>
        )}
      </section>
      <Footer />
    </main>
  );
}
