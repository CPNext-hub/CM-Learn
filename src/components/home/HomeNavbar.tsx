"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { initials } from "@/lib/api-client";

interface NavbarProps { onSearch?: (value: string) => void }

// FE01's navbar, linked to real pages. Hidden: notification bell (no notification system in the MVP),
// "⌘K" shortcut hint (no shortcut implemented). The profile chip now shows the logged-in user.
export function Navbar({ onSearch }: NavbarProps) {
  const [search, setSearch] = useState("");
  const { data: session } = authClient.useSession();
  return (
    <header className="site-header">
      <div className="nav-inner">
        <Link href="/" className="sd-brand" aria-label="SheetDeedee หน้าหลัก">
          <span className="sd-brand-mark">▤</span>
          <span className="sd-brand-copy"><strong>ชีทดี <i>SheetDeedee</i></strong><small>คลังสรุปที่แบ่งปันความรู้จากเพื่อน ๆ</small></span>
        </Link>
        <nav className="main-nav">
          <Link className="sd-active" href="/">หน้าแรก</Link>
          <Link href="/discover">สำรวจและค้นหา</Link>
          <a href="#categories">หมวดหมู่</a>
          <Link href="/my-sheets">คลังชีทของฉัน</Link>
        </nav>
        <form className="sd-nav-search" onSubmit={(event) => { event.preventDefault(); onSearch?.(search); }}>
          <span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชีทสรุป..." />
        </form>
        <Link className="upload-nav" href="/upload">อัปโหลดชีท<br />สรุป</Link>
        {session ? (
          <Link href="/profile" className="profile-nav" title={session.user.name}>
            <span>{initials(session.user.name)}</span>
            <small>{session.user.name}</small>
          </Link>
        ) : (
          <Link href="/login" className="profile-nav"><span>→</span><small>เข้าสู่<br />ระบบ</small></Link>
        )}
      </div>
    </header>
  );
}
