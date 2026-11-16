import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CM Learn",
  description: "พื้นที่สร้างและแบ่งปันสรุปบทเรียน",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body>{children}</body></html>;
}
