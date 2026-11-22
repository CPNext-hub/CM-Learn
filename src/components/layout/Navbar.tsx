import Link from "next/link";

type NavbarProps = { active?: string };

export default function Navbar({ active }: NavbarProps) {
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
        <Link className="nav-icon-link" href="/profile" aria-label="โปรไฟล์"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M6.8 18a5.7 5.7 0 0 1 10.4 0" /></svg></Link>
      </div>
    </nav>
  );
}
