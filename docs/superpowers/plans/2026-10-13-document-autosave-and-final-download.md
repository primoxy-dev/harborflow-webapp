# Document Autosave and Immediate PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save OKTB, Terminal Permit and LOI across devices, simplify their existing editors, and let authorized users immediately download PDFs without draft markings.

**Architecture:** Extend the existing private documents API with versioned document sections in Neon. A focused client autosave controller owns queues and conflicts; the existing editor and PDF renderer consume saved sections and an official-source embassy directory. Crew and Visitor sections remain independently permission-checked; offline documents never call this persistence API.

**Tech Stack:** Existing vanilla JavaScript/ES modules, Vercel Node functions, `@neondatabase/serverless` 1.1.0, node:test, Playwright and existing canvas PDF writer. No new hosted service or AI provider.

**Spec:** `docs/superpowers/specs/2026-10-13-document-autosave-and-final-download-design.md` (user approved).

## Global Constraints

- ผู้มีสิทธิ์ดูเอกสารดาวน์โหลด PDF ไม่มี Draft / Sample / Not Approved ได้ทันที ไม่ต้องผ่านเจ้าของอนุมัติทีละฉบับ
- ไม่เปลี่ยนสิทธิ์ Crew / Visitor ไม่เปิดเอกสารให้สาธารณะ และไม่อนุญาตข้อมูลบุคคลจริงโดยปริยาย ระบบทดลองยังใช้ข้อมูลสมมติ
- ใช้ Neon ส่วนตัวที่ Operations ใช้อยู่ ไม่เก็บเนื้อหาเอกสารใน GitHub สาธารณะหรือ browser storage
- บันทึกประมาณ 800 ms หลังหยุดพิมพ์; การเลือกคน เพิ่ม/ลบแถว และแก้หัวข้อเข้าคิวเดียวกัน
- ใช้ version และ base values เพื่อป้องกันการเขียนทับจากเครื่องอื่น; Conflict หยุด autosave และให้ตรวจค่าเดิม/ส่วนกลาง/ค่าของตนเอง ไม่มีปุ่มเขียนทับทั้งหมด
- Offline retains sample markings and its existing explicit local-save behavior; no silent migration or online sync.
- Downloads do not change Job/Service status, send documents, publish samples or upload PDFs.
- Do not deploy until separately requested. Preserve unrelated work including unpublished Operations Plan.

## Review Focus

1. Duplicate person names: choices must distinguish IDs without leaking data beyond the granted scope (Task 4).
2. Revoke only Visitor permission while an autosave is pending: hidden sections must never be returned or overwritten (Tasks 1–3).
3. Switch LOI person while an in-flight save completes: response must not overwrite the new person's state (Task 3).
4. Empty Subject, cleared selections and deleted rows must remain empty after reload rather than being reseeded (Tasks 1, 3).
5. Long embassy contact blocks and large Permit tables must paginate without hiding text or signature (Task 6).

## Execution Setup

Use `superpowers:using-git-worktrees` at execution time. Current checkout contains unrelated dirty overlays and a design-only local commit; production base is GitHub `9949bf9b59708439dda5c42dd999d61e4b1d5c70`. Inspect current remote HEAD again before choosing the base. Bring only the approved spec/plan into the isolated workspace, not the unpublished Operations Plan or private permit seed file. Keep `output/private/terminal-permit-defaults.json` out of commits/tests. Establish the baseline with `node --test tests/*.test.mjs`.

## File Map and Shared Types

- `lib/document-records.mjs`: validation, section projection, revisioned storage; `migrations/003_document_records.sql`: schema.
- `api/documents.mjs`: existing account/session/person permissions plus new read/save actions and edit-scope checks.
- `document-autosave.mjs`: browser queue/state; `documents.js`: editor integration and download guards.
- `permit-draft.mjs`, `documents.css`: combobox selection, layout and default headers.
- `data/thai-missions.json`, `lib/thai-missions.mjs`: public mission directory and safe contact formatting.
- `oktb-pdf.js`: online final output and retained offline sample output.
- Tests follow existing `tests/*.test.mjs`; browser regression runner `scripts/document-workflow-qa.mjs` uses fictional fixtures only.

`DocumentKey={jobId:string,serviceId:string|null,type:'oktb'|'permit'|'loi'}`. `Section='common'|'crew'|'visitor'`. `SectionRecord={section,data,version,updatedAt,updatedBy,sourceFingerprint}`. Record key is computed server-side from validated IDs/type/section, never accepted as an arbitrary client key. Person selections are UUIDs, LOI overrides are keyed by person UUID, table row UUIDs are stable across reloads.

Common data: issueDate, arrivalDate/permitDate, airline, subject, embassyId, embassySnapshot (Task 5 Mission record), custom addressee fields and loiTitle. Crew data: selected crew IDs, selected LOI ID, per-person LOI fields, Permit on/off tables. Visitor data: Permit medical/inspection/agent/staff/car tables. Personal contact/signature defaults stay in existing account preferences and do not enter shared sections. All inputs use explicit field allowlists; table shapes come from `PERMIT_TABLES`, not client-supplied `fields` arrays.

### Task 1: Versioned private record storage

**Files:** Create `lib/document-records.mjs`, `migrations/003_document_records.sql`, `tests/document-records.test.mjs`.
**Interfaces:** `validateDocumentSection(type,section,data,allowedPeople): {data}|{error}`; `readDocumentSections(sql,key,scope): SectionRecord[]`; `saveDocumentSection(sql,key,section,{patch,base,version,sourceFingerprint},actor): {status,record?,conflicts?}`. Scope carries explicit crewView/crewEdit/visitorView/visitorEdit booleans. Later API task enforces Job/Service assignment.

- [ ] Write failing tests: `saves_clears_and_reloads` asserts empty subject/empty selections stay empty; `cas_does_not_overwrite` expects 409 and unchanged stored row; `hidden_section_omitted` expects no Visitor keys for Crew-only access; `invalid_shape_rejected` rejects forged columns, excessive rows, unknown people and malformed dates. Use Neon-shaped query fixtures only at the database boundary.
- [ ] Run `node --test tests/document-records.test.mjs`; confirm assertions fail because behavior is missing, not because imports cannot resolve.
- [ ] Create records table: `record_key text PRIMARY KEY`, job/service FKs, type/section checks, bounded JSONB data, version, actor, timestamps and source fingerprint. Create separate private revision table. Save and revision log must be one atomic SQL operation. Zero rows updated returns 409. Hidden sections must not participate in a user's patch. Validate up to 100 rows per Permit table, 300 characters per cell, 80 per header, 120 per title, 500 Subject and existing signature/account limits unchanged.
- [ ] Run targeted tests and `node --test tests/*.test.mjs`; stage only this task's files and commit `feat: add private revisioned document sections`.

### Task 2: Permission-checked document API

**Files:** Modify `api/documents.mjs`, `lib/document-preview.mjs`; create `tests/document-records-api.test.mjs`.
**Interfaces:** GET `action=documentState&jobId&serviceId&type` returns `{login,preview,sections,canEdit:{common,crew,visitor},sourceFingerprint}`. POST `action=saveDocumentSection` takes `{login,...DocumentKey,section,patch,base,version,sourceFingerprint}` and returns Task 1 result. Existing preview/preferences/defaults actions keep their contracts.

- [ ] Write failing tests: `viewer_reads_cannot_save` expects GET 200/POST 403; `service_mismatch_rejected` expects 404; `pic_without_editor_denied` expects 403; `revoked_visitor_cannot_read_or_patch` checks every returned field; `csrf_denied` expects 403; `source_changed_blocks_save` expects 409.
- [ ] Run `node --test tests/document-records-api.test.mjs` and confirm intended failures.
- [ ] Validate current session and grants on every request. Load Job and optional active Crew Change Service, check belongs to Job, then use `canEditJob` / `canEditService` plus corresponding separate person edit grant. OKTB/LOI require Crew View. Permit common fields require at least one currently authorized scope; saving common fields requires assigned edit scope and at least one corresponding person edit permission. Cross-scope rows cannot be selected. Return no-store and generic database errors, not raw SQL/identity data. Reject unknown section actions. Source fingerprint derives allowed Job/person fields in a stable order; editing unrelated unauthorized people cannot expose their versions through a conflict payload.
- [ ] Run API tests and whole suite; commit `feat: enforce document autosave scope and source checks`.

### Task 3: Autosave lifecycle integration

**Files:** Create `document-autosave.mjs`, `tests/document-autosave.test.mjs`; modify `documents.js` and `index.html` only if module wiring needs it.
**Interfaces:** `createDocumentAutosave({load,save,onState,onConflict,delayMs=800})` returns `{load(),change(section,patch),flush(),dispose(),hasPending()}`. State values `unsaved|saving|saved|error|conflict`. Conflict UI receives per-field `{original,shared,local}`; resolving a field retains an explicit user choice and fresh base/version.

- [ ] Write failing tests: `debounces_800ms`, `serializes_midflight_changes`, `switch_person_does_not_apply_old_response`, `error_is_not_saved`, `dispose_cancels_old_account`, `reload_keeps_empty_values`, `conflict_pauses_queue`. Inject a test clock and only the transport boundary; no persistence in browser storage.
- [ ] Run `node --test tests/document-autosave.test.mjs` and check failures.
- [ ] Hydrate sections before rendering; use null/missing distinctions rather than `||=` to preserve cleared fields. Queue changes from inputs, selectors, add/remove and headers. Flush before switching context/downloading, guard stale responses by generation+key+login, and warn before unload with dirty data. 401/403 clears sensitive content and cancels timers; 409 stops the queue and shows field comparisons without overwrite-all. Do not autosave initial templates or old in-memory/offline contexts without an explicit edit. Disable shared edit controls for Viewers. Continue existing account preferences without copying them into shared data.
- [ ] Run targeted/whole suite; commit `feat: autosave document edits with visible conflicts`.

### Task 4: Collapsed editors and single-name combobox

**Files:** Modify `documents.js`, `permit-draft.mjs`, `documents.css`; modify `tests/permit.test.mjs`; create browser assertions in `scripts/document-workflow-qa.mjs`.
**Interfaces:** Extend Permit model with `setManualName(table,row,value)` clearing `personId`, and `personChoices(table,people,query)` returning safe `{id,label}` suggestions. Existing `choosePerson()` remains the copying operation.

- [ ] Write failing tests: `manual_name_unlinks_person`, `duplicate_names_select_distinct_ids`, `custom_headers_not_replaced`. Browser test asserts one editable name input per named row, no adjacent select, collapsed outer/settings/table details, and immediate LOI Personal Detail expansion on person change.
- [ ] Run `node --test tests/permit.test.mjs` and browser runner against fixture pages; observe intended failures before changing UI.
- [ ] Implement accessible combobox with keyboard Arrow/Enter/Escape support and explicit ID selection; never pick an ambiguous matching name silently. Defaults use Name - Surname and only the exact old default header is migrated. Permit named column 280px, No. 44px, action 68px; table scroll confined to wrapper. Collapse details initially, but preserve opened tables across row updates so editing does not close the active group. LOI fills known values and displays Name - Surname in Personal Detail without guessing passport surname/given-name splits. Add browser tests at 390px/768px widths and for reopened tables after add/remove.
- [ ] Run targeted/whole suite; commit `feat: simplify permit name entry and document panels`.

### Task 5: Official Thai mission directory and LOI addressee

**Files:** Create `data/thai-missions.json`, `lib/thai-missions.mjs`, `tests/thai-missions.test.mjs`; modify `documents.js` and `documents.css`.
**Interfaces:** Mission record `{id,kind:'embassy'|'consulate-general',name,address,phone,fax,emails:{general:[],visa:[]},sourceUrl,verifiedAt,status:'verified'|'incomplete'}`. `missionContactLines(mission): string[]` emits name/address/phone/fax/general email/visa email in order, excluding blank values; `validateMissionDirectory(records)` rejects duplicate IDs or verified entries missing official-source date evidence.

- [ ] Write failing tests with fictional missions: `contacts_in_document_order`, `empty_fax_omitted`, `incomplete_not_claimed_verified`, `saved_addressee_survives_directory_update`, `general_and_visa_email_distinct`; run `node --test tests/thai-missions.test.mjs` to establish RED.
- [ ] Implement loader/formatter. Enumerate Royal Thai Embassies and Consulates-General using MFA's official directory, then inspect each official contact page. Record actual verification date/URL. Include Dhaka and existing five missions; never recycle their contacts for other offices. Inaccessible offices remain incomplete with explicit labels and editable document-level contact fields. Do not claim all worldwide contact records verified if any are incomplete. Store only public office contacts in code/data; no private crew data. Render same ordered contact lines in LOI preview and persist the selected mission snapshot/overrides in common section.
- [ ] Run targeted tests, directory validation and browser addressee test; commit `feat: add sourced Thai mission contacts to LOI`.

### Task 6: Immediate final PDFs and download guards

**Files:** Modify `documents.js`, `oktb-pdf.js`, `lib/document-preview.mjs`; create `tests/document-downloads.test.mjs`; extend `tests/oktb-pdf.test.mjs` and browser QA runner.
**Interfaces:** PDF functions accept explicit `outputMode:'final'|'sample'`; default stays sample for backward safety. Online permitted download uses final after `flush()` and a fresh documentState/source/revision check. Offline explicitly supplies sample. LOI renderer consumes Task 5's contact lines.

- [ ] Write failing tests: `online_final_has_no_draft_markings`, `offline_sample_retained`, `download_waits_for_failed_autosave`, `revocation_blocks_all_three_downloads`, `stale_revision_requires_review`. Existing PDF fake canvas tests assert drawing calls/text; browser tests produce actual PDF files from fictional records.
- [ ] Run targeted tests and observe failures. Read PDF skill before generating/rendering QA PDFs, following its current instructions.
- [ ] Remove draft badges/watermarks/filename suffixes only in final output and change online button labels. Recheck session/scope/source for OKTB as well as Permit/LOI. No owner-approval requirement; no automatic external sending or status changes. Replace LOI fixed one-page placement with height-aware text layout and pagination for long official address/contact lines; keep signature/closing intact. Render Permit Name - Surname header width consistently in preview/PDF.
- [ ] Run full node suite plus `node scripts/document-workflow-qa.mjs`; render PDFs, inspect each page, check final lacks Draft/Sample while offline remains labelled. Commit `feat: export authorized final documents with safe download checks`.

## Final Review and Delivery Gate

- [ ] Run whole suite and fictional browser flows: two separate authenticated sessions saving/reloading/conflicting, network interruption, logout/revocation, three downloads, desktop/mobile/iPad and offline no-network regression. A mocked transport is not proof of real Neon cross-device persistence; verify an authorized preview with fictional data before claiming that boundary works.
- [ ] Perform one independent whole-change review using `superpowers:requesting-code-review`; resolve critical/important findings. Report worldwide offices still incomplete, real-database verification limitations and PDF pagination results explicitly.
- [ ] Hand off a preview and verification report. Do not push/deploy unpublished unrelated changes; release needs a separate user request and explicit team/project/commit confirmation.

## Execution Choice

Recommend **Native**: implement tasks inline with one final independent review, because API/model/autosave/PDF contracts are tightly coupled and a fresh implementer per task adds context overhead. Subagent-driven remains an option if the user wants per-task independent implementation/review. Wait for the user to review this plan and choose before changing product code.
