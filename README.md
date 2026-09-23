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

เปิดหน้า **Operations** → คลิกชื่อเรือในปฏิทิน → แก้ **Job No., ETA, ETB, ETD, Principal** แล้วกด **Save job details** → เพิ่ม/แก้ไข/ลบ **Service** → คลิก **Crew change**

หน้ารายละเอียด Crew Change เปิดเต็มจอ มี 3 แท็บ: **Crew members and Visitors, Travel, Checklist** กลุ่มรายชื่อ On-signers, Off-signers, Medical visitors, SIRE Inspectors, Surveyors, Service Engineers และ Other พับ/ขยายได้ แต่ละกลุ่มเพิ่มและลบคนในตารางได้ กด **Flight / Immigration** ที่แถวของบุคคลเพื่อกรอกข้อมูล Immigration และเพิ่ม/ลบเที่ยวบินของคนนั้น ส่วนแท็บ Travel มีตารางการใช้รถและเรือที่เพิ่ม/ลบรายการได้

## สถานะการพัฒนา

เว็บนี้เป็น **interactive front-end prototype** พร้อมข้อมูลสาธิต ยังไม่มีฐานข้อมูล การเข้าสู่ระบบ การเก็บข้อมูลถาวร หรือการกำหนดสิทธิ์จริง การกด Approve, Sync และ Generate Report หลายจุดเป็นเพียงการแสดงผลสาธิต เฉพาะข้อมูล Job ที่ไม่ใช่ข้อมูลลูกเรือจะเก็บใน localStorage ของเบราว์เซอร์นี้หลังบันทึก ส่วนข้อมูล Crew Change รวมถึงหมายเลขเอกสาร วันที่เอกสาร Visa และเที่ยวบินยังอยู่ในหน่วยความจำและจะหายเมื่อรีโหลด

ข้อมูลราคา ข่าว จำนวนงาน และหมายเลขเอกสารบนหน้าเว็บเป็นตัวอย่าง ยังไม่ได้เชื่อม Excel บน GitHub, ระบบ Finance, Email หรือ ERP และยังสร้าง PDF/Excel/PowerPoint จริงไม่ได้

**อย่ากรอกข้อมูลส่วนบุคคลหรือเอกสารจริงใน prototype นี้** โดยเฉพาะเลข Passport และ Seaman Book เพราะหน้าเว็บยังไม่มีระบบรักษาความปลอดภัยหรือการจัดเก็บที่เหมาะสมสำหรับข้อมูลดังกล่าว

## Create Job และโครงสร้างเอกสาร (งานระหว่างพัฒนา)

ปุ่ม **Create job** เพิ่ม Job ในรายการ **Jobs saved in this browser** และเปิดรายละเอียดเพื่อเพิ่ม Service ได้แล้ว ข้อมูล Job และชื่อ Service ของ Job ที่สร้างใหม่เก็บเฉพาะใน localStorage ของเบราว์เซอร์นี้ ไม่มีการ sync ข้ามเครื่องหรือบัญชี หน้า Job แสดง **Planned GitHub folders** เป็นตัวอย่าง path; ยังไม่มีการสร้างไฟล์หรือโฟลเดอร์บน GitHub

รูปแบบ path ที่เตรียมไว้:

```text
Jobs/2026/09. SEP/10. SHION - HF-20260910-001/
├── Crew Change/
└── General/
```

ชื่อโฟลเดอร์ถูกตัดอักขระที่ใช้เป็นตัวคั่น path และมี Job No. ต่อท้ายเพื่อแยกงานของเรือลำเดียวกันในวันเดียวกัน Service ที่เพิ่มใน Job จะปรากฏในรายการ path ตัวอย่าง ส่วน `General` มีไว้เสมอ

เอกสารงานจริงควรอยู่ใน [private repository `primoxy-dev/harborflow-job-documents`](https://github.com/primoxy-dev/harborflow-job-documents) ที่แยกจาก source code สาธารณะ การทำให้ Sync ใช้งานจริงต้องมีฐานข้อมูล Job, ระบบ Login/สิทธิ์, และ API ฝั่ง server ที่รับรองสิทธิ์ผู้ใช้ก่อนเขียน GitHub โดยเก็บ GitHub credential เป็น secret ฝั่ง server เท่านั้น ไม่ฝัง token ใน `index.html` หรือ `enhancements.js` และไม่ส่งเอกสารส่วนบุคคลไป repository สาธารณะ

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
├── index.html        # โครงหน้าเว็บและส่วนสาธิตเดิม
├── enhancements.js   # การทำงาน Job, Service และ Crew Change
├── enhancements.css  # รูปแบบหน้าจอส่วนที่เพิ่ม
└── README.md         # คู่มือและสถานะโปรเจกต์
```

