import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Icon from "@/components/ui/Icon";
import LogoutButton from "@/components/auth/LogoutButton";

export default function ProfilePage() {
  return (
    <main className="site-frame">
      <Navbar />
      <section className="page-surface">
        <div className="profile-hero">
          <div className="profile-avatar">PN</div>
          <div style={{ flex: 1 }}>
            <h1 className="profile-name">PA NU</h1>
            <p className="profile-handle">@panu.dev</p>
            <span className="tag">
              <Icon name="graduation" size={13} /> นักศึกษามหาวิทยาลัย
            </span>
            <p className="profile-bio">
              ชอบเรียนรู้ เทคโนโลยี และการพัฒนาเว็บไซต์
            </p>
          </div>
          <Link className="secondary-button" href="/profile/edit">
            <Icon name="edit" size={14} /> แก้ไขโปรไฟล์
          </Link>
        </div>
        <div className="profile-stats">
          <div className="stat">
            <Icon className="stat-icon" name="file" size={17} />
            <strong>12</strong>
            <span>ชีตทั้งหมด</span>
          </div>
          <div className="stat">
            <Icon className="stat-icon" name="download" size={17} />
            <strong>468</strong>
            <span>ยอดดาวน์โหลด</span>
          </div>
          <div className="stat">
            <Icon className="stat-icon" name="heart" size={17} />
            <strong>24</strong>
            <span>ถูกใจ</span>
          </div>
        </div>
        <div className="profile-columns">
          <div>
            <section className="panel">
              <h3>
                <Icon name="user" size={16} /> ข้อมูลส่วนตัว
              </h3>
              <div className="info-row">
                <span className="info-label">
                  <Icon name="user" size={14} /> ชื่อ-นามสกุล
                </span>
                <strong>PA NU</strong>
              </div>
              <div className="info-row">
                <span className="info-label">
                  <Icon name="mail" size={14} /> อีเมล
                </span>
                <strong>panu@example.com</strong>
              </div>
              <div className="info-row">
                <span className="info-label">
                  <Icon name="calendar" size={14} /> วันที่สมัคร
                </span>
                <strong>24 พฤศจิกายน 2568</strong>
              </div>
            </section>
            <section className="panel" style={{ marginTop: 14 }}>
              <h3>
                <Icon name="tag" size={16} /> ความสนใจ
              </h3>
              <div className="tag-list">
                <span className="tag">Web Development</span>
                <span className="tag">UI/UX</span>
                <span className="tag">Database</span>
                <span className="tag">Tech & IT</span>
                <span className="tag">Design</span>
              </div>
            </section>
            <section className="panel" style={{ marginTop: 14 }}>
              <h3>
                <Icon name="link" size={16} /> ช่องทางติดต่อ
              </h3>
              <div className="tag-list">
                <span className="tag">
                  <Icon name="github" size={13} /> GitHub
                </span>
                <span className="tag">
                  <Icon name="youtube" size={13} /> YouTube
                </span>
                <span className="tag">
                  <Icon name="discord" size={13} /> Discord
                </span>
                <span className="tag">
                  <Icon name="link" size={13} /> Portfolio
                </span>
              </div>
            </section>
          </div>
          <section className="panel">
            <h3>
              กิจกรรมล่าสุด{" "}
              <Link
                className="text-link"
                href="/my-sheets"
                style={{ float: "right", fontSize: 10 }}
              >
                ดูทั้งหมด →
              </Link>
            </h3>
            {["สรุป Layout / Navbar", "สรุป Database", "สรุป CSS"].map(
              (title, index) => (
                <div className="activity" key={title}>
                  <span className="mini-pdf">PDF</span>
                  <div>
                    <strong>อัปโหลดชีต</strong>
                    <small>
                      {title} · {index + 2} วันที่แล้ว
                    </small>
                  </div>
                  <Icon
                    className="activity-arrow"
                    name="arrow-right"
                    size={15}
                  />
                </div>
              ),
            )}
          </section>
        </div>
        <div
          style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}
        >
          <LogoutButton />
        </div>
      </section>
      <Footer />
    </main>
  );
}
