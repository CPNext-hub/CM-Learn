export type IconName =
  | "home" | "cloud-upload" | "file" | "folder" | "search" | "grid" | "list"
  | "more" | "edit" | "trash" | "eye" | "save" | "arrow-left" | "plus"
  | "arrow-right" | "check" | "close" | "mail" | "lock" | "user" | "graduation"
  | "calendar" | "download" | "heart" | "link" | "github" | "youtube" | "discord" | "log-out" | "tag";

type IconProps = { name: IconName; size?: number; className?: string };

export default function Icon({ name, size = 18, className }: IconProps) {
  const common = { className: `ui-icon${className ? ` ${className}` : ""}`, width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };

  switch (name) {
    case "home": return <svg {...common}><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-7h6v7"/></svg>;
    case "cloud-upload": return <svg {...common}><path d="M7 18H6a4 4 0 0 1-.5-8A6.5 6.5 0 0 1 18 8a5 5 0 0 1 .5 10H17"/><path d="M12 21V11m0 0-4 4m4-4 4 4"/></svg>;
    case "file": return <svg {...common}><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z"/><path d="M13 3v7h7"/></svg>;
    case "folder": return <svg {...common}><path d="M3.25 6.5A2.25 2.25 0 0 1 5.5 4.25h4.2l2.1 2.2h6.7a2.25 2.25 0 0 1 2.25 2.25v8.8a2.25 2.25 0 0 1-2.25 2.25h-13a2.25 2.25 0 0 1-2.25-2.25z" fill="currentColor"/></svg>;
    case "search": return <svg {...common}><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>;
    case "grid": return <svg {...common}><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>;
    case "list": return <svg {...common}><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r=".7"/><circle cx="4.5" cy="12" r=".7"/><circle cx="4.5" cy="18" r=".7"/></svg>;
    case "more": return <svg {...common}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>;
    case "edit": return <svg {...common}><path d="m14 5 5 5M4 20l4.3-.8L19 8.5a2.1 2.1 0 0 0-3-3L5.3 16.2z"/></svg>;
    case "trash": return <svg {...common}><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>;
    case "eye": return <svg {...common}><path d="M2.5 12s3.2-6 9.5-6 9.5 6 9.5 6-3.2 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>;
    case "save": return <svg {...common}><path d="M5 3h12l3 3v15H4V3z"/><path d="M8 3v6h8V3M8 21v-8h8v8"/></svg>;
    case "arrow-left": return <svg {...common}><path d="M19 12H5m0 0 6-6m-6 6 6 6"/></svg>;
    case "plus": return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case "arrow-right": return <svg {...common}><path d="M5 12h14m0 0-6-6m6 6-6 6"/></svg>;
    case "check": return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
    case "close": return <svg {...common}><path d="m6 6 12 12M18 6 6 18"/></svg>;
    case "mail": return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>;
    case "lock": return <svg {...common}><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></svg>;
    case "user": return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>;
    case "graduation": return <svg {...common}><path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c4 3 8 3 12 0v-5M22 9v6"/></svg>;
    case "calendar": return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/></svg>;
    case "download": return <svg {...common}><path d="M12 3v12m0 0 5-5m-5 5-5-5M4 19v2h16v-2"/></svg>;
    case "heart": return <svg {...common}><path d="M20.8 8.8c0 5.2-8.8 11-8.8 11S3.2 14 3.2 8.8A4.3 4.3 0 0 1 12 6.7a4.3 4.3 0 0 1 8.8 2.1Z"/></svg>;
    case "link": return <svg {...common}><path d="M10 13.5a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.7 1.7M14 10.5a4.5 4.5 0 0 0-6.4 0l-3 3A4.5 4.5 0 0 0 11 20l1.7-1.7"/></svg>;
    case "github": return <svg {...common}><path d="M9 19c-4.5 1.4-4.5-2.5-6.3-3m12.6 5v-3.4a3 3 0 0 0-.8-2.3c2.7-.3 5.5-1.3 5.5-6A4.7 4.7 0 0 0 18.7 6a4.3 4.3 0 0 0-.1-3s-1-.3-3.2 1.2a11 11 0 0 0-5.8 0C7.4 2.7 6.4 3 6.4 3a4.3 4.3 0 0 0-.1 3 4.7 4.7 0 0 0-1.3 3.3c0 4.7 2.8 5.7 5.5 6a3 3 0 0 0-.8 2.3V21"/></svg>;
    case "youtube": return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="4"/><path d="m10 9 5 3-5 3z"/></svg>;
    case "discord": return <svg {...common}><path d="M7 6a15 15 0 0 1 10 0l2 11a13 13 0 0 1-4 2l-1-2M7 6 5 17a13 13 0 0 0 4 2l1-2"/><path d="M8 14h.01M16 14h.01M8 10c2.7 2 5.3 2 8 0"/></svg>;
    case "log-out": return <svg {...common}><path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/></svg>;
    case "tag": return <svg {...common}><path d="M20 13 13 20a2 2 0 0 1-3 0l-6-6V4h10l6 6a2 2 0 0 1 0 3Z"/><circle cx="8" cy="8" r="1"/></svg>;
  }
}
