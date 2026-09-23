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

## Crew records and private documents

The Crew members and Visitors tab saves records in the private repository `primoxy-dev/harborflow-job-documents`. Select **Sign in with GitHub** as `primoxy-dev`, edit the fields, and select **Save crew data**. Passport, Seaman Book, Flight and Visa / permission accept PDF, JPEG or PNG attachments up to 5 MB. The displayed filename confirms the attachment was uploaded and its crew record saved.

Records and attachments use this path:

```text
Jobs/YYYY/MM. MON/DD. VESSEL - JOB-NO/Service Name/Category/
├── crew.json
├── Passport/PERSON-ID/filename.pdf
├── Seaman Book/PERSON-ID/filename.pdf
├── Flight/PERSON-ID/FLIGHT-ID/filename.pdf
└── Visa - permission/PERSON-ID/filename.pdf
```

Each category has its own `crew.json`. For **Other**, the typed category becomes the folder name. Job No. and ETA determine the path; changing either after records exist creates a new path. Move the old private folder manually if needed.

### Required Vercel configuration

Add these environment variables to the Vercel project before using personal data:

- `GITHUB_OAUTH_CLIENT_ID`: GitHub OAuth App client ID.
- `GITHUB_OAUTH_CLIENT_SECRET`: GitHub OAuth App client secret.
- `HARBORFLOW_SESSION_SECRET`: a long random secret for signed, eight-hour login cookies.
- `GITHUB_DOCUMENTS_TOKEN`: fine-grained GitHub token restricted to `primoxy-dev/harborflow-job-documents` with **Contents: Read and write**.

Create the OAuth App in the `primoxy-dev` GitHub account. Set its callback URL to `https://YOUR-VERCEL-HOST/api/auth?mode=callback`. Use the exact host where this app will run. Configure the four variables for that deployment environment and redeploy. The API rejects writes until all variables exist, checks GitHub's authenticated login, and only permits `primoxy-dev`.

The public source repository contains no GitHub credential or crew document. Job metadata is still stored in this browser. Other dashboard sections remain sample UI.

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
├── api/              # GitHub login, crew sync and attachments
├── lib/              # shared server-side validation and GitHub API
└── README.md         # คู่มือและสถานะโปรเจกต์
```

