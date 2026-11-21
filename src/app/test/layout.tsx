import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SessionBar } from "./_components";

// BE test pages: plain HTML for trying the API by hand. NOT the real UI (that belongs to FE).
// Disabled in production builds so they can never ship by accident.
export default function TestLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div style={{ fontFamily: "sans-serif", padding: 16, maxWidth: 960 }}>
      <p>
        <b>[หน้าทดสอบ BE]</b> <Link href="/test">หน้าแรก</Link> | <Link href="/test/sheets">ชีททั้งหมด</Link> |{" "}
        <Link href="/test/upload">อัปโหลด</Link> | <Link href="/test/my-sheets">ชีทของฉัน</Link>
      </p>
      <SessionBar />
      <hr />
      {children}
    </div>
  );
}
