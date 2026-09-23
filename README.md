# HarborFlow

ตัวอย่าง Web App สำหรับวางแนวทางระบบ **Ship Agency Operations & Business Intelligence Platform**

- เว็บตัวอย่าง: https://harborflow-webapp.vercel.app/
- Source code: https://github.com/primoxy-dev/harborflow-webapp

## เปิดใช้งาน

เปิด `index.html` ในเว็บเบราว์เซอร์ได้ทันที หรือเข้าผ่านลิงก์ Vercel ด้านบน โปรเจกต์นี้เป็นหน้าเว็บแบบ static ไม่ต้องติดตั้ง dependency หรือรัน build command

## ส่วนที่แสดงในตัวอย่าง

1. **Operations Control Center** — ปฏิทิน Port Call, Job Detail, Services, Tasks, Documents, Timeline และ Smart Alerts
2. **Commercial & Finance** — หน้าภาพรวม Quotation/PDA/FDA, Price Master, Prefund และรายการรออนุมัติ
3. **Knowledge Base** — Port/Terminal requirements, SOP, previous cases และ supplier rate intelligence
4. **Marketing Agent Team / CRM** — Accounts, opportunities, pipeline และงานติดตามลูกค้า
5. **Management & Market Intelligence** — ผลดำเนินงานรายเดือน, highlights/lowlights, ข่าวตลาด และ initiatives
6. **Platform Foundation** — หน้าตัวอย่าง Master Data, Integrations, Security, Audit และ Export

### ตัวอย่างขั้นตอน Crew Change

เปิดหน้า **Operations** → คลิกชื่อเรือในปฏิทิน → คลิก **Crew change** ใน Job → กด **Add crew member**

ฟอร์มตัวอย่างรองรับชื่อ สัญชาติ ตำแหน่ง วันเกิด ประเภท Sign-on/Sign-off หมายเลข Passport และ Seaman Book วันหมดอายุ เอกสาร Visa/BG เที่ยวบิน และสถานะ Immigration สามารถเพิ่มและลบแถวรายชื่อลูกเรือบนหน้าจอได้

## สถานะการพัฒนา

เว็บนี้เป็น **interactive front-end prototype** พร้อมข้อมูลสาธิต ยังไม่มีฐานข้อมูล การเข้าสู่ระบบ การเก็บข้อมูลถาวร หรือการกำหนดสิทธิ์จริง การกด Save, Approve, Sync และ Generate Report หลายจุดเป็นเพียงการแสดงผลสาธิต ข้อมูลที่เพิ่มใน Crew Change จะหายเมื่อรีโหลดหน้าเว็บ

ข้อมูลราคา ข่าว จำนวนงาน และหมายเลขเอกสารบนหน้าเว็บเป็นตัวอย่าง ยังไม่ได้เชื่อม Excel บน GitHub, ระบบ Finance, Email หรือ ERP และยังสร้าง PDF/Excel/PowerPoint จริงไม่ได้

**อย่ากรอกข้อมูลส่วนบุคคลหรือเอกสารจริงใน prototype นี้** โดยเฉพาะเลข Passport และ Seaman Book เพราะหน้าเว็บยังไม่มีระบบรักษาความปลอดภัยหรือการจัดเก็บที่เหมาะสมสำหรับข้อมูลดังกล่าว

## งานที่ต้องทำก่อนใช้งานจริง

- ออกแบบฐานข้อมูลสำหรับ Job, Service, Crew Member, Task, Document และ Audit Log
- เพิ่ม Login, สิทธิ์ตามบทบาท และการควบคุมการเข้าถึงข้อมูลลูกเรือ
- ทำ CRUD จริงพร้อม validation, soft delete และ revision history
- เชื่อม Price Master จาก Excel ผ่านขั้นตอนตรวจสอบก่อน publish
- สร้าง Approval workflow, Quotation/PDA/FDA และรายงานที่ export ได้จริง
- เพิ่มการทดสอบและตรวจสอบความปลอดภัยก่อนนำข้อมูลจริงเข้าระบบ

## โครงสร้างไฟล์

```text
harborflow-webapp/
├── index.html  # ตัวอย่างเว็บทั้งหมดในไฟล์เดียว
└── README.md   # คู่มือและสถานะโปรเจกต์
```

