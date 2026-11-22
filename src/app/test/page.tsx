import Link from "next/link";

export default function TestHome() {
  return (
    <main>
      <h1>หน้าทดสอบระบบ CM Learn (BE01)</h1>
      <p>หน้าเหล่านี้เรียก API จริงและใช้ฐานข้อมูลจริง ไม่มี CSS เพราะใช้ทดสอบเท่านั้น</p>
      <ol>
        <li>
          <Link href="/register">สมัครสมาชิก</Link> หรือ <Link href="/login">เข้าสู่ระบบ</Link> (แล้วกลับมาที่ /test)
        </li>
        <li>
          <Link href="/test/upload">อัปโหลดชีท</Link> — เลือกไฟล์ กรอกรายละเอียด ดู Preview แล้วยืนยัน
        </li>
        <li>
          <Link href="/test/sheets">ชีททั้งหมด</Link> — ค้นหา กรองวิชา/หมวดหมู่ เรียงลำดับ แบ่งหน้า
        </li>
        <li>เปิดชีท — ดูรายละเอียด Preview ดาวน์โหลด (ถ้าเป็นเจ้าของ: แก้ไข ซ่อน ลบ เปลี่ยนไฟล์)</li>
        <li>
          <Link href="/test/my-sheets">ชีทของฉัน</Link> — ดูชีททุกสถานะของตัวเอง
        </li>
        <li>
          <Link href="/test/profile">โปรไฟล์</Link> — ดูสถิติ แก้ชื่อ/แนะนำตัว อัปโหลดหรือลบรูปโปรไฟล์
        </li>
      </ol>
      <p>
        เอกสาร API: <code>docs/API.md</code>
      </p>
    </main>
  );
}
