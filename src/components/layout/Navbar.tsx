"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import Icon from "@/components/ui/Icon";
import { initials } from "@/lib/api-client";

type NavbarProps = { active?: string };

export default function Navbar({ active }: NavbarProps) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  const logout = async () => {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <nav className="site-nav">
      <Link className="brand" href="/">
        <span className="brand-copy"><strong>CM HUB</strong><small>พื้นที่แบ่งปันชีตการเรียน</small></span>
      </Link>
      <div className="nav-links">
        <Link className={active === "upload" ? "active" : ""} href="/upload">Upload</Link>
        <Link className={active === "sheets" ? "active" : ""} href="/my-sheets">My Sheets</Link>
      </div>
      <div className="nav-spacer" />
      <form className="nav-search" action="/my-sheets" method="get" role="search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5" /></svg>
        <input type="search" name="search" aria-label="ค้นหาชีต" placeholder="ค้นหาชีต..." />
      </form>
      <div className="nav-actions">
        {isPending ? null : session ? (
          <>
            <Link className="nav-user" href="/profile" aria-label="โปรไฟล์" title={session.user.name}>
              <span className="avatar">
                {session.user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- avatar from our API or an OAuth provider
                  <img src={session.user.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  initials(session.user.name)
                )}
              </span>
            </Link>
            <button className="nav-icon-link" type="button" onClick={logout} aria-label="ออกจากระบบ" title="ออกจากระบบ" style={{ background: "none", border: 0 }}>
              <Icon name="log-out" size={18} />
            </button>
          </>
        ) : (
          <Link className="text-link" href="/login">เข้าสู่ระบบ</Link>
        )}
      </div>
    </nav>
  );
}
