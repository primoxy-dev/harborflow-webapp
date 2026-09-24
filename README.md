# HarborFlow

Web App ทดลองสำหรับ **Ship Agency Operations & Business Intelligence Platform**. Operations/Services now use a shared Neon Postgres database; other dashboard sections may still be demonstrations.

- เว็บตัวอย่าง: https://harborflow-webapp.vercel.app/
- Source code: https://github.com/primoxy-dev/harborflow-webapp

## เปิดใช้งาน

เข้าผ่านลิงก์ Vercel ด้านบน การเปิด `index.html` โดยตรงจะไม่เชื่อม Operations API. Production and Preview need a Vercel-linked Neon database exposing `DATABASE_URL`; Vercel installs `@neondatabase/serverless` from `package.json`.

## Operations trial

Operations requires GitHub sign-in. `primoxy-dev` is the owner; the owner grants named Viewer/Editor roles and separate Crew View/Edit and Visitor View/Edit permissions. A PIC name alone never grants access. The owner creates Port Calls. Editors may change only assigned Jobs or Service instances. Up to 10 named users (including owner) and 80 Port Calls are supported in this trial.

Port Calls and repeated Service instances autosave to Neon. Creating a Port Call also creates `Jobs/YYYY/MM. MON/DD. VESSEL - JOB-NO/General/job.json` in the private documents repository; Vessel, Job No. and ETA are required even for Draft. Adding a Service creates a folder named for its Service type. Existing Port Calls can create their folder with **Create GitHub folder**. The GitHub folder is renamed with its contents when Vessel, Job No. or ETA changes. Cancelled Jobs add ` cancelled` after the Job No.; changing back removes the suffix. Job No. is unique across all statuses. Service numbers are permanent within a Job; removal is recoverable by the owner with a reason. Every change has an actor history. Field conflicts stop and show original, shared and local values for review. Crew/Visitor and linked travel are separately permission-gated. No Operations or person data is cached in browser storage. Existing browser-only sample Jobs are not imported.

**Use fictional or de-identified records only. Do not enter real crew, visitor, passport or medical data.** The production personal-data, retention, backup/restore, and recovery policies have not been completed. The other dashboard modules remain examples and are not covered by the new Operations database.

The database schema is in [migrations/001_operations.sql](migrations/001_operations.sql). Run it in the linked Neon database before deploying API changes. Run `node --test tests/*.test.mjs` locally. Never commit `.env` files or connection strings.

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

### Terminal Restriction and Contact list

Open **Knowledge base** → **Terminal Restriction and Contact list**. Every Terminal Restriction field (including Notes and Source) is public and can be viewed without sign-in. Contacts are stored separately and require a named GitHub account with Contact-view access. The owner grants three independent permissions: edit restrictions, view contacts, and edit contacts; a Contact editor also has view access. A Knowledge Base Administrator manages ordinary grants but has no Contact or crew access by default. Only the owner can grant administrator status or restore a prior revision.

Edits save automatically with actor history and revision checks. Conflicting rows require individual review; there is no whole-table overwrite. Existing browser-only data can be submitted privately as separate Terminal or Contact import proposals, then approved entry by entry by the owner. If GitHub is temporarily unavailable, only a previously fetched public Terminal copy may appear, clearly marked stale for at most 24 hours; Contacts are never shown from offline cache. Use fictional or de-identified personal data during the trial. See [the domain glossary](CONTEXT.md), [the access decision](docs/adr/0001-separate-public-terminal-restrictions-and-private-contacts.md), and [emergency recovery plan](docs/EMERGENCY-RECOVERY.md).

## Crew records and private documents

The Crew members and Visitors tab saves records in the private repository `primoxy-dev/harborflow-job-documents`. Select **Sign in with GitHub** as `primoxy-dev`, edit the fields, and select **Save crew data**. Passport, Seaman Book, Flight and Visa / permission accept PDF, JPEG or PNG attachments up to 3 MB. The displayed filename confirms the attachment was uploaded and its crew record saved.

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

Create the OAuth App in the `primoxy-dev` GitHub account. Set its callback URL to `https://YOUR-VERCEL-HOST/api/auth?mode=callback`. Use the exact host where this app will run. Configure the four variables for that deployment environment and redeploy. The API rejects writes until all variables exist. `primoxy-dev` owns the Knowledge base and is the only editor initially. Anyone can view Terminal Restrictions without login. Contact details require named Contact-view access. The owner can separately grant restriction editing, Contact viewing, Contact editing, and administrator status. Crew records and attachments remain owner-only, regardless of Knowledge base role.

The public source repository contains no GitHub credential, crew document, terminal table, or sharing list. The shared Knowledge base and ACL are stored in the private documents repository. The public API returns Terminal Restrictions only; Contact data stays behind a signed-in permission check. All Terminal fields are public, so do not put private information in their Notes or Source. Operations Jobs and Services are in Neon; the legacy browser demo is no longer loaded. Other dashboard sections remain sample UI.

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
├── knowledge.js       # Terminal restrictions and contact list
├── knowledge.css      # Knowledge base table styles
├── api/              # GitHub login, crew sync and attachments
├── lib/              # shared server-side validation and GitHub API
└── README.md         # คู่มือและสถานะโปรเจกต์
```


