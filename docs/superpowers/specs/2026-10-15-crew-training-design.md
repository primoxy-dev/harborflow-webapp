# Crew Training in HarborFlow Operations — design

Date: 2026-10-15  
Status: proposed for user review

## Purpose and agreed constraints

Add **Crew Training** under Operations so the shore Crewing/Training team and the vessel's Master/Officer can plan and record crew training together. The core question is: who must complete which course, by when, and which available session avoids duties and joining dates? The initial release uses **fictional or de-identified data only**, works online, and is usable on desktop and mobile. Offline capture is a later phase.

HarborFlow currently stores Crew Change people within a Job. A person can appear in several Jobs, so those rows cannot serve as the permanent training identity. The training module needs an organization-level crew record with explicit links to Job people. The existing Operations database and GitHub sign-in are reused, but training authorization is separate from Crew View/Edit and Job PIC permissions. Existing trial warnings remain visible until policies for real personal data, retention, backup and recovery are completed.

Success means a coordinator can see training gaps and create a conflict-checked plan; a vessel officer can view their vessel's plan, record onboard attendance and results; and neither a booking nor attendance alone marks a person ready to join. Every decision is attributable and reversible through an audited correction.

## Navigation and screens

Add **Crew Training** as a child of Operations in the desktop and mobile navigation. It opens a full-width workspace with these views:

| View | Main content and actions |
| --- | --- |
| Overview | Due soon, overdue, pending results, certificates awaiting review, conflicts, and crew whose readiness cannot yet be confirmed. Filters by vessel, rank and date. |
| Calendar | Day/week/month sessions for shore and onboard training; filters for vessel, course, instructor and venue. Moving a confirmed session creates a proposed change with affected people and conflicts rather than silently changing the booking. |
| Crew | Stable training identity, rank, vessel assignment, availability, required courses, planned sessions, results, certificates and readiness for a selected vessel/rank/join date. Link to matching Crew Change person where available. |
| Training Matrix | Versioned requirements by rank, vessel type and optional vessel, with source, owner, effective dates, recurrence and approval. Show how each requirement applies to a person. |
| Courses & Sessions | Course catalog, prerequisites, duration, delivery mode, instructor/venue/capacity, session plan, participants, attendance, assessment and completion. |
| Certificates | Upload and review queue, issuer, issue/expiry dates, linked course/result, review decision and replacement history. |
| Costs & Reports | Phase 2: planned versus actual course, travel and hotel costs; completion, overdue and audit exports. |

On mobile, the primary actions are viewing an assigned plan, acknowledging changes, taking attendance, recording an assessment and uploading evidence. Dense matrix and reports can scroll horizontally with clear row headings; critical actions must not depend on drag gestures.

## Roles and permissions

The owner grants training permissions to named GitHub accounts. A person's Operations Crew View/Edit grant or Job PIC label does not automatically grant training access.

| Role | Allowed operations |
| --- | --- |
| Training viewer | Read training summaries within assigned scope; cannot download certificate attachments. |
| Shore training coordinator | Manage crew registry links, courses, draft requirements and sessions, enrollment, results and costs; propose matrix changes. |
| Training approver | Approve matrix versions, exceptions/waivers, confirmed schedule changes and certificate verification. May be combined with coordinator for the owner. |
| Vessel Master/Officer | Read assigned vessel's plan; create onboard draft sessions; record attendance, assessment and evidence for their vessel; propose changes. Cannot approve their own exception unless explicitly granted. |

The API checks role and vessel scope on every read and write. Search, exports and attachments use the same checks. The public Operations summary never includes training, crew names, results or certificates. Audit events record actor, time, before/after state and reason for approval, waiver, cancellation and correction.

## Data model and links

Use a new migration with dedicated `training_*` tables; keep the existing Job and Service tables intact. Each mutable record has an ID, version, creator, timestamps and soft-removal where appropriate.

| Entity | Key fields and relationships |
| --- | --- |
| Crew profile | Stable internal crew ID, fictional display name, rank/department, active status. `training_crew_job_links` maps it to zero or more `operation_people` rows; links require a reviewed match. Do not copy passport numbers or documents. |
| Vessel & assignment | Canonical vessel ID, type, assigned crew and joining/leaving dates. Optional link to Operations Job vessel after explicit matching. |
| Course | Code, name, version, format, duration, prerequisites, pass criteria, refresh interval and owner. |
| Matrix rule | Course, rank/type/vessel scope, effective interval, due rule, source, approver and version. Publishing a new version does not rewrite historical decisions. |
| Requirement | Derived per crew/course/date from the approved matrix, with a trace to the matching rule. Exceptions are separate approved records with reason and end date. |
| Session | Course, shore/onboard mode, start/end and location time zone, vessel/venue, instructor, capacity, status and version. |
| Enrollment, attendance, result | Crew-session link, booking/confirmation, attendance evidence, assessment outcome, assessor and timestamps. Store these as distinct facts. |
| Certificate | Crew, course/result, issuer, number, issue/expiry dates, document reference, verification state and reviewer. Old versions remain in history. |
| Availability block | Duty, travel, leave, joining period or manual unavailability with source and confidence; incomplete availability stays explicitly unknown. |
| Cost and notification | Phase 2 records for estimated/actual cost and queued delivery events; no automatic external email in phase 1. |

Training attachments belong to a cross-Job location in the existing private documents repository, such as `Training/Crew/<crew-id>/Certificates/<certificate-id>/`, rather than a Job folder. Neon stores document references and review metadata. The storage path must not contain a person's name or passport number. Upload/download endpoints validate type, size, access and ownership. Trial uploads must contain fictional data only.

## Scheduling and state rules

In phase 1, the calendar checks a manually selected session and shows conflicts before confirmation. In phase 3, **Suggest training plan** ranks candidate sessions by due date, joining date, prerequisites, seat and instructor/venue capacity, vessel or shore location, known availability, and estimated travel/cost. Suggestions are drafts with a visible explanation and conflict list. The coordinator or assigned officer chooses; the system never books or reschedules a confirmed session on its own.

Hard conflicts include overlapping sessions, known duty/travel blocks, missing prerequisites, full capacity and a session after the required completion date. Unknown duty or joining data appears as **needs verification**, never as free time. A confirmed session change shows affected crew, instructor and venue; an approver confirms or rejects it. Store the session's IANA time zone and UTC instant, and show local times in the calendar and notifications.

Keep separate state machines:

- Requirement: `required → planned → awaiting result → satisfied`, with `overdue` calculated from the due date and a separately approved, expiring waiver.
- Session: `draft → proposed → confirmed → completed`, with `cancelled` and `rescheduled` transitions that preserve history.
- Attendance/result: attendance `unknown/present/absent`; assessment `pending/passed/failed`. Presence never implies a pass.
- Certificate: `missing → pending review → verified` or `rejected`; `expired` is calculated from the verified document's date.

Readiness for a vessel, rank and joining date is a computed answer with contributing requirements and evidence. It can be **ready**, **not ready** or **cannot verify**. Missing matrix coverage, incomplete availability, pending assessment or unverified certificate prevents a ready result. A designated approver can record a time-limited exception, but it remains visible in the explanation and audit history.

## Main flows

1. The shore coordinator creates a fictional crew profile, maps it to Crew Change records when applicable, and selects vessel/rank/join dates.
2. The approved Training Matrix produces due requirements with source and deadline. The Overview and crew page show gaps.
3. The coordinator selects a session, reviews conflicts, then proposes or confirms it. An onboard officer can propose onboard sessions for their vessel. In phase 3, ranked suggestions assist this choice.
4. The officer/instructor records attendance and assessment. A failed or absent person returns to the planning queue; no certificate is inferred.
5. A certificate is uploaded and checked by an authorized reviewer. Readiness recalculates and shows the evidence or missing pieces.
6. Schedule, result and document corrections create new versions and audit events; users with stale versions see a conflict to resolve.

## API, reliability and verification

Implement a separate `/api/training` surface using the existing GitHub session and Neon connection. Keep queries scoped server-side by training role and vessel assignment. Do not expose training rows through the anonymous Operations endpoint. Use explicit validation and optimistic version checks for concurrent edits, plus idempotency keys for session enrollment and evidence upload. Do not cache crew, result or certificate data in browser storage.

Required checks for the first implementation:

- Matrix applicability across rank/vessel/effective-date boundaries, recurrence and approved waivers.
- No false `ready` result for booked-only, attended-only, failed, pending-review, expired or incomplete records.
- Conflict detection for overlapping sessions, capacity, prerequisites and known duty/joining blocks; unknown availability is flagged.
- Permission isolation between shore, assigned vessel, unrelated vessel and anonymous users, including downloads and exports.
- Two users editing the same session or result get a reviewable conflict; cancellation and corrections retain history.
- Desktop and mobile flows work with keyboard and touch; dates and time zones are unambiguous.

## Delivery sequence

1. **Core online trial:** navigation; fictional crew registry and Job links; courses; approved matrix; requirements; calendar; shore/onboard sessions; enrollment; attendance/results; certificate review; basic readiness and conflicts; scoped permissions and audit.
2. **Operations workflow:** approvals, notifications, cost tracking, reports and exports, with travel/hotel references where available. Notifications are drafts/queues until recipients and delivery rules are configured.
3. **Assisted planning:** ranked schedule proposals, scenario comparison and explanations; then offline onboard capture with explicit sync conflict review. AI may summarize or extract draft certificate fields, but approved matrix rules and human verification determine readiness.

The first phase is complete only when both shore and vessel roles can finish the fictional end-to-end flow and all readiness/permission checks pass. Real crew data remains out of scope until separate privacy, retention, recovery and access policies have been approved and tested.

