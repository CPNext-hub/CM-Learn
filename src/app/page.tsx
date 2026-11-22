"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/home/HomeNavbar";
import { Footer } from "@/components/home/HomeFooter";
import { FeaturedSheetCard, LatestSheetCard } from "@/components/home/sheet-card";
import { getHomePageData, searchHomeSheets } from "@/services/homeService";
import type { HomePageData, HomeSheet } from "@/types/home";
import "./home.css";

const ALL = "";

// Home (FE01 design) — all numbers and sheets come from /api/v1 (see services/homeService).
// Hidden until a backend exists: user count, rating, "Top 3 creators", Helpful points, fake hashtag suggestions.
export default function HomePage() {
  const [data, setData] = useState<HomePageData | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState(""); // the query that was actually submitted
  const [categoryId, setCategoryId] = useState(ALL);
  const [sort, setSort] = useState<"popular" | "newest">("popular");
  const [sheets, setSheets] = useState<HomeSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");

  useEffect(() => {
    getHomePageData()
      .then((result) => setData(result))
      .catch((error: unknown) => setApiError(error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, []);

  // The list under "คลังชีทสรุป" asks the server again whenever the search, category or sort changes.
  useEffect(() => {
    let active = true;
    searchHomeSheets({ search, categoryId, sort, page: 1, limit: 6 })
      .then((result) => active && setSheets(result))
      .catch((error: unknown) => active && setApiError(error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [search, categoryId, sort]);

  function handleSearch(value: string) {
    setQuery(value);
    setSearch(value.trim());
    document.getElementById("latest")?.scrollIntoView({ behavior: "smooth" });
  }

  function pickCategory(id: string) {
    setCategoryId(id);
    document.getElementById("latest")?.scrollIntoView({ behavior: "smooth" });
  }

  const categories = data?.categories ?? [];
  const featured = data?.popularSheets ?? [];

  return (
    <main className="home-page">
      <Navbar onSearch={handleSearch} />
      <section className="hero-section">
        <div className="hero-glow" />
        <div className="hero-content">
          <span className="hero-eyebrow">คลังชีทสรุปที่แบ่งปันโดยเพื่อน ๆ นักศึกษา</span>
          <h1>เตรียมตัวสอบแบบมั่นใจ ด้วยชีทสรุปคุณภาพ<br className="desktop-break" /> จากเพื่อนๆ ทุกมหาวิทยาลัย <span>📚 ✨</span></h1>
          <p>ค้นหา สรุปบทเรียน เลกเชอร์ย้อนหลัง ข้อสอบเก่า และเตรียมสอบ Midterm/Final ครบจบในที่เดียว<br className="desktop-break" /> โหลดอ่านได้ทันใจตลอด 24 ชั่วโมง</p>
          <form className="hero-search" onSubmit={(event) => { event.preventDefault(); handleSearch(query); }}>
            <span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="พิมพ์ชื่อชีท หรือคำในคำอธิบาย เช่น แคลคูลัส, อนุพันธ์..." /><button type="submit">ค้นหาชีท <b>→</b></button>
          </form>
          <div className="stats-row">
            <div><span className="sd-stat-icon pink">▤</span><strong>{(data?.stats.totalSheets ?? 0).toLocaleString()}</strong><small>ชีทสรุปที่เผยแพร่</small></div>
            <div><span className="sd-stat-icon green">♧</span><strong>{(data?.stats.totalSubjects ?? 0).toLocaleString()}</strong><small>รายวิชา</small></div>
            <div><span className="sd-stat-icon mauve">★</span><strong>{(data?.stats.totalCategories ?? 0).toLocaleString()}</strong><small>หมวดหมู่ชีท</small></div>
          </div>
        </div>
      </section>

      <section className="category-section section-wrap" id="categories">
        <div className="sd-section-heading category-heading"><div><span className="overline">EXPLORE BY CATEGORY</span><h2>หมวดหมู่ชีทสรุป</h2></div><Link href="/discover">ค้นหาแบบละเอียด　→</Link></div>
        <div className="category-grid">
          {categories.map((item) => <button key={item.id} className={`category-tile ${item.color}`} onClick={() => pickCategory(item.id)}><span>{item.icon}</span><strong>{item.name}</strong><small>{item.sheetCount.toLocaleString()} ชีท</small></button>)}
        </div>
      </section>

      {featured.length > 0 && (
        <section className="featured-section" id="featured">
          <div className="section-wrap">
            <div className="sd-section-heading"><div><span className="section-pill">◎ ยอดนิยม</span><h2>ชีทสรุปที่มีคนเปิดดูมากที่สุด</h2><p>เรียงตามยอดเข้าชมของชีทที่เผยแพร่ 💫</p></div></div>
            <div className="featured-grid">{featured.map((sheet) => <FeaturedSheetCard key={sheet.id} sheet={sheet} />)}</div>
          </div>
        </section>
      )}

      <section className="latest-section section-wrap" id="latest">
        <div className="latest-panel">
          <div className="sd-section-heading latest-heading"><div><h2>คลังชีทสรุปยอดนิยมและอัปเดตล่าสุด</h2><p>{search ? `ผลการค้นหา “${search}”` : "เข้าถึงสรุปตรงจุด อัปเดตใหม่จากเพื่อนของคุณ"}</p></div>
            <div className="sort-tabs"><button className={sort === "popular" ? "sd-selected" : ""} onClick={() => setSort("popular")}>🔥 ยอดนิยม</button><button className={sort === "newest" ? "sd-selected" : ""} onClick={() => setSort("newest")}>✨ อัปโหลดล่าสุด</button></div>
          </div>
          <div className="filter-row"><button className={categoryId === ALL ? "filter-active" : ""} onClick={() => setCategoryId(ALL)}>ทุกหมวดหมู่</button>{categories.slice(0, 4).map((item) => <button key={item.id} className={categoryId === item.id ? "filter-active" : ""} onClick={() => setCategoryId(item.id)}>{item.name}</button>)}<span className="api-indicator">{apiError ? `● เชื่อมต่อไม่สำเร็จ: ${apiError}` : "● ข้อมูลจริงจากระบบ"}</span></div>
          <div className="latest-grid">{sheets.map((sheet) => <LatestSheetCard key={sheet.id} sheet={sheet} />)}</div>
          {!loading && sheets.length === 0 && <div className="sd-empty-state">ไม่พบชีทที่ตรงกับคำค้นหา ลองเปลี่ยนคำค้นหาหรือหมวดหมู่ดูนะคะ</div>}
          <div className="more-row"><Link href={search ? `/discover?q=${encodeURIComponent(search)}` : "/discover"}>ดูชีทสรุปทั้งหมด⌄</Link></div>
          {loading && <small className="loading-note">กำลังโหลดข้อมูลล่าสุดจากระบบ…</small>}
        </div>
      </section>

      <section className="creator-section section-wrap" id="creator">
        <div className="creator-banner">
          <div className="creator-copy"><span className="creator-label">♧ SheetDeedee Creator Club</span><h2>มีสรุปบทเรียนลายมือสวยหรือเลกเชอร์ที่อยากแบ่งปันไหม? ✍️✨</h2><p>ร่วมแบ่งปันชีทสรุปของคุณเพื่อช่วยเหลือเพื่อนๆ ร่วมสถาบัน รองรับ PDF, รูปภาพ และไฟล์ Office</p><div className="creator-benefits"><span>♧ รองรับ PDF / รูป / DOCX / PPTX / XLSX</span><span>◷ แสดงชื่อผู้สร้างทุกชีท</span><span>♡ ฟรี 100% ไม่มีค่าธรรมเนียม</span></div><div className="creator-actions"><Link href="/upload">☁ เริ่มอัปโหลดชีทของคุณเลย (ฟรี)</Link><Link href="/my-sheets">ชีทของฉัน</Link></div></div>
          <span className="grade-mark">A+</span>
        </div>
      </section>
      <Footer />
    </main>
  );
}
