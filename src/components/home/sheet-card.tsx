import Link from "next/link";
import type { HomeSheet } from "@/types/home";

function compact(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

// Hidden (no backend data): page count, "verified", fake ribbons ("อ่านง่าย 98%"), download count, save button.
export function FeaturedSheetCard({ sheet }: { sheet: HomeSheet }) {
  return (
    <article className="featured-card">
      <Link href={`/sheets/${sheet.id}`} className="featured-image" style={sheet.thumbnailUrl ? { backgroundImage: `linear-gradient(180deg,transparent,#241c29aa),url(${sheet.thumbnailUrl})` } : undefined}>
        {!sheet.thumbnailUrl && <span className="image-placeholder">▧</span>}
        {sheet.fileType && <span className="page-count">▣ {sheet.fileType}</span>}
        <span className="subject-chip">{sheet.subjectName}</span>
      </Link>
      <div className="featured-body">
        <div className="sheet-tags"><span>{sheet.category}</span></div>
        <Link href={`/sheets/${sheet.id}`} className="featured-title">{sheet.title}</Link>
        <div className="sheet-author"><span className="sd-avatar">{sheet.author.name.slice(0, 1)}</span><span>{sheet.author.name}</span><span className="sheet-metrics">◉ {compact(sheet.views)} &nbsp; ♥ {compact(sheet.likes)}</span></div>
        <div className="sd-card-actions"><Link href={`/sheets/${sheet.id}`}>◉ ดูชีท</Link></div>
      </div>
    </article>
  );
}

export function LatestSheetCard({ sheet }: { sheet: HomeSheet }) {
  return (
    <article className="latest-card">
      <Link href={`/sheets/${sheet.id}`} className="latest-thumb" style={sheet.thumbnailUrl ? { backgroundImage: `url(${sheet.thumbnailUrl})` } : undefined}>
        {!sheet.thumbnailUrl && <span>▧</span>}{sheet.fileType && <b>{sheet.fileType}</b>}
      </Link>
      <div className="latest-content">
        <div className="latest-meta"><span>{sheet.category}</span></div>
        <Link href={`/sheets/${sheet.id}`} className="latest-title">{sheet.title}</Link>
        <small>อัปโหลดโดย: {sheet.author.name} · {sheet.subjectName}</small>
        <div className="latest-stats"><span>◉ {compact(sheet.views)}</span><span>♥ {compact(sheet.likes)}</span><Link href={`/sheets/${sheet.id}`}>ดูตัวอย่างชีท</Link></div>
      </div>
    </article>
  );
}
