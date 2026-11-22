import Link from "next/link";

export function Footer() {
  return (
    <footer className="sd-site-footer">
      <div className="footer-grid">
        <div><Link href="/" className="footer-brand">▤ <b>SheetDeedee</b></Link><p>คอมมูนิตี้แลกเปลี่ยนสรุปบทเรียนและคลังข้อสอบมหาวิทยาลัย เพื่อการเรียนรู้ร่วมกันแบบแบ่งปันและสร้างสรรค์</p><span className="footer-safe">♧ ปลอดภัยดี &amp; ตรวจสอบเนื้อหาโดยผู้ใช้งาน</span></div>
        <div><h3>หมวดหมู่วิชายอดนิยม</h3><p>คณะแพทยศาสตร์ &amp; วิทยาศาสตร์สุขภาพ<br />คณะวิศวกรรมศาสตร์ &amp; นิเทศศาสตร์<br />คณะบริหารศาสตร์และภาษา<br />นิติศาสตร์ &amp; รัฐศาสตร์<br />วิชาศึกษาทั่วไป (General Education)</p></div>
        <div><h3>ระบบชุมชนนักศึกษา</h3><p>เงื่อนไขการแบ่งปันชีท<br />ระบบคะแนนการแบ่งปัน (Helpful Score)<br />แนวทางการให้เครดิตเจ้าของเนื้อหา<br />คู่มือการสแกนและอัปโหลด PDF</p></div>
        <div><h3>ช่วยเหลือและติดต่อเรา</h3><p>มีข้อสงสัยเกี่ยวกับการดาวน์โหลด แจ้งปัญหา หรือติดต่อแอดมินได้ 24 ชั่วโมง</p><span className="contact-pill">LINE: @sheetdeedee</span></div>
      </div>
      <div className="footer-bottom"><span>© 2025 SheetDeedee (ชีทดี). All rights reserved. Made with warmth for Thai university students.</span><div><a href="#terms">ข้อกำหนดการใช้งาน</a><a href="#privacy">นโยบายความเป็นส่วนตัว</a><a href="#report">รายงานลิขสิทธิ์</a></div></div>
    </footer>
  );
}
