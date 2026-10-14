# Crew Training Core Online Trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a working Crew Training workspace under HarborFlow Operations for fictional shore and onboard training, from approved requirements through verified certificates and readiness.

**Architecture:** Extend the existing static client, GitHub session, Vercel Node API and Neon database with a separate training domain. Keep cross-Job crew identity and training grants separate from Operations Job people and grants; expose no training data publicly. Split pure rules, conflict and readiness logic from API persistence so each can be tested without a database.

**Tech Stack:** Browser JavaScript/CSS, Node.js ESM and `node:test`, Vercel Functions, `@neondatabase/serverless` 1.1.0, Neon Postgres, existing private GitHub document repository.

**Spec:** `docs/superpowers/specs/2026-10-15-crew-training-design.md`

## Global Constraints

- Phase 1 is online only and uses fictional or de-identified data; preserve the existing trial warning.
- Both shore Crewing/Training and assigned vessel Master/Officer must finish the training flow.
- Crew training identity is stable across Jobs; `operation_people` is only an explicitly reviewed link.
- Training grants are separate from Operations Crew View/Edit and Job PIC. Anonymous Operations never returns training data.
- Booking, attendance, passing, certificate verification and readiness remain separate facts.
- Unknown availability yields `needs verification`, not an assumed free slot.
- Offline capture, costs/reports, notifications, ranked proposals and AI belong to later plans.

## Review Focus

1. A repeated Crew Change person link must be rejected rather than silently joining two training profiles (Task 2 test).
2. A matrix rule beginning or ending on the selected date must apply according to its inclusive start/exclusive end interval (Task 3 test).
3. Missing duty or joining data must return `needs verification` even when no explicit overlap exists (Task 4 test).
4. An officer assigned to vessel A must receive 403 for vessel B, including document downloads (Tasks 1 and 6 tests).
5. Booked-only, attended-only, failed, pending-review and expired evidence must never produce `ready` (Task 6 test).

---

## File map

| File | Responsibility |
| --- | --- |
| `migrations/002_training.sql` | Training tables, keys, indexes and grants. |
| `lib/training/access.mjs` | Pure training role and vessel-scope decisions. |
| `lib/training/crew.mjs` | Crew profile validation and reviewed Job-person links. |
| `lib/training/matrix.mjs` | Course/rule validation and requirement derivation. |
| `lib/training/schedule.mjs` | Session state and deterministic conflict checks. |
| `lib/training/outcomes.mjs` | Attendance, assessment and certificate transitions. |
| `lib/training/readiness.mjs` | Explainable readiness calculation. |
| `lib/training/documents.mjs` | Private cross-Job certificate paths and guarded file operations. |
| `api/training.mjs` | Authenticated, scoped Vercel route; SQL writes and optimistic versions. |
| `training.js`, `training.css` | Responsive workspace and forms; no browser storage of crew data. |
| `workspaces.js`, `index.html` | Operations child navigation and script/style loading. |
| `tests/training-*.test.mjs` | Domain, permission and API regression tests. |

### Task 1: Schema, training access and guarded API shell

**Files:** Create `migrations/002_training.sql`, `lib/training/access.mjs`, `api/training.mjs`, `tests/training-access.test.mjs`; modify `README.md` with migration order.

**Interfaces:** `trainingAccess({login, grant, vesselIds, action, targetVesselId}) -> boolean`; `createTrainingRoute({database, loginFromRequest, readTrainingGrant}) -> async Request => Response`. The route defaults to the existing `db` and `sessionLogin` and accepts injectable dependencies for tests.

- [ ] Write `tests/training-access.test.mjs`: owner access; viewer cannot write/download; shore coordinator may edit; officer assigned vessel A can write A and gets 403 for B; anonymous GET and POST return 401; unrelated Operations Crew Edit and PIC confer no training grant.
- [ ] Run `node --test tests/training-access.test.mjs`; expect missing module/function failure.
- [ ] Add training grants and vessel assignments plus versioned training entity tables to `002_training.sql`. Add `trainingAccess`; route every action through session, grant and scope checks before querying or mutating records. Default-deny unknown actions; no public read path.
- [ ] Run `node --test tests/training-access.test.mjs`; expect all tests PASS.
- [ ] Commit schema, API shell, tests and README: `feat: establish guarded training domain`.

### Task 2: Stable crew registry and reviewed Operations links

**Files:** Create `lib/training/crew.mjs`, `tests/training-crew.test.mjs`; extend `api/training.mjs` and `002_training.sql` from Task 1 only if the initial table definition needs a migration correction before application.

**Interfaces:** `validateCrewProfile(raw) -> {value,error}`; `validateCrewLink({crewId, operationPersonId, personKind, existingLinks}) -> string|null`. API actions `crew.list`, `crew.create`, `crew.update`, `crew.link`, `crew.unlink` return versioned rows.

- [ ] Write tests for required fictional display name/rank, duplicate link rejection across profiles, non-crew kind rejection, no passport field persistence, stale-version conflict and vessel-scoped listing.
- [ ] Run `node --test tests/training-crew.test.mjs`; expect FAIL for missing functions.
- [ ] Implement profile and link validation, lookup of the `operation_people` row before linking, an explicit reviewed link event, scoped SQL and optimistic updates. Never copy passport or existing document fields into training tables.
- [ ] Run `node --test tests/training-crew.test.mjs`; expect PASS.
- [ ] Commit: `feat: add cross-job training crew registry`.

### Task 3: Courses, approved matrix and due requirements

**Files:** Create `lib/training/matrix.mjs`, `tests/training-matrix.test.mjs`; extend `api/training.mjs`.

**Interfaces:** `validateCourse(raw) -> {value,error}`; `validateRule(raw) -> {value,error}`; `deriveRequirements({crew, assignment, rules, courses, onDate, waivers}) -> Requirement[]`. API actions `courses.*`, `matrix.draft`, `matrix.approve`, `requirements.list` require their respective training grants.

- [ ] Write tests for rank/type/vessel matching, start inclusive/end exclusive, prerequisite and recurrence dates, version/source/approver preservation, unapproved rule exclusion and approved waiver expiry.
- [ ] Run `node --test tests/training-matrix.test.mjs`; expect FAIL.
- [ ] Implement validated course and immutable approved rule versions. Derive requirements from the selected date without altering historical versions; store rule/source trace and require approver plus reason for a waiver.
- [ ] Run `node --test tests/training-matrix.test.mjs`; expect PASS.
- [ ] Commit: `feat: derive training requirements from approved matrix`.

### Task 4: Sessions, enrollment and conflict checks

**Files:** Create `lib/training/schedule.mjs`, `tests/training-schedule.test.mjs`; extend `api/training.mjs`.

**Interfaces:** `detectTrainingConflicts({session, crewIds, otherSessions, availability, prerequisites, capacity}) -> {hard: Conflict[], unknown: Conflict[]}`; `validateSessionTransition(from,to) -> boolean`. API actions `sessions.list/create/update/propose/confirm/cancel`, `enrollments.add/remove`.

- [ ] Write tests for overlapping sessions, full capacity, missing prerequisites, duty/travel and joining-date collisions, unknown availability, DST/local-zone input, duplicate enrollment idempotency, and proposed change retaining affected participants and old version.
- [ ] Run `node --test tests/training-schedule.test.mjs`; expect FAIL.
- [ ] Accept session start/end as ISO 8601 instants with offsets plus an IANA display zone; verify that rendered local times round-trip, then store UTC instants and the zone. Implement pure conflict evaluation, `draft/proposed/confirmed/completed/cancelled` transitions, scoped versioned SQL and idempotency key on enrollment. Block confirmation on hard conflicts and label unknown data for human review.
- [ ] Run `node --test tests/training-schedule.test.mjs`; expect PASS.
- [ ] Commit: `feat: schedule training sessions with explainable conflicts`.

### Task 5: Attendance and assessment facts

**Files:** Create `lib/training/outcomes.mjs`, `tests/training-outcomes.test.mjs`; extend `api/training.mjs`.

**Interfaces:** `validateOutcome({attendance, assessment, assessor, evidence}) -> {value,error}`; API actions `outcomes.record`, `outcomes.correct`, `outcomes.list`.

- [ ] Write tests showing `present` plus `pending` is not passed, absent/failed remain unsatisfied, onboard officer may record only for assigned vessel, correction requires reason and a newer version, and deleted sessions cannot receive results.
- [ ] Run `node --test tests/training-outcomes.test.mjs`; expect FAIL.
- [ ] Implement independent attendance and assessment data with assessor, time, version and audit. Preserve earlier outcomes on correction.
- [ ] Run `node --test tests/training-outcomes.test.mjs`; expect PASS.
- [ ] Commit: `feat: record onboard and shore training outcomes`.

### Task 6: Certificate review and explainable readiness

**Files:** Create `lib/training/documents.mjs`, `lib/training/readiness.mjs`, `tests/training-readiness.test.mjs`, `tests/training-documents.test.mjs`; extend `api/training.mjs`.

**Interfaces:** `certificatePath(crewId,certificateId,filename) -> string`; `calculateReadiness({requirements,results,certificates,waivers,availability,onDate}) -> {status:'ready'|'not ready'|'cannot verify',reasons:Reason[]}`. API actions `certificates.upload/review/download/list`, `readiness.get`. Upload is an authenticated, same-origin multipart POST limited to a 3 MB PDF/JPEG/PNG; download is a scoped GET.

- [ ] Write tests for safe cross-Job path, allowed file types/size, vessel B download denial, pending/rejected/expired certificate, failed or attendance-only result, missing matrix coverage, approved waiver expiry and full verified evidence yielding `ready`.
- [ ] Run `node --test tests/training-readiness.test.mjs tests/training-documents.test.mjs`; expect FAIL.
- [ ] Implement private `Training/Crew/<id>/Certificates/<id>/` storage through existing GitHub helper, metadata in Neon, restricted download/review, replacement history and pure readiness reasons. Trial files must be fictional.
- [ ] Run `node --test tests/training-readiness.test.mjs tests/training-documents.test.mjs`; expect PASS.
- [ ] Commit: `feat: verify certificates and calculate readiness`.

### Task 7: Operations navigation and responsive training workspace

**Files:** Create `training.js`, `training.css`; modify `workspaces.js`, `index.html`.

**Interfaces:** `window.HarborFlowTraining.mount(root)` and `.refresh()`; calls `/api/training` with action names from Tasks 1–6. A `Crew Training` child entry in the existing Operations workspace group opens `#training`.

- [ ] Record a browser acceptance scenario for child navigation, all six phase-1 views, no anonymous person data, loading/error states, keyboard-usable controls and absence of local/session storage of crew data; confirm the missing Crew Training entry fails it before implementation.
- [ ] Add Overview, Calendar, Crew, Matrix, Courses & Sessions and Certificates views with scoped filters and forms. Show the fictional-data warning, `cannot verify` reasons, conflict list and explicit status labels; allow both shore and vessel workflows on narrow screens.
- [ ] Run the same browser scenario on a preview deployment at desktop and mobile widths; expect PASS and no console errors.
- [ ] Commit: `feat: add crew training workspace to Operations`.

### Task 8: End-to-end trial verification and release

**Files:** Add `tests/training-flow.test.mjs`; update `README.md` with setup and fictional trial flow.

**Interfaces:** No new public API; exercise actions and outputs defined above with injected database and GitHub adapters or a seeded isolated trial database.

- [ ] Write end-to-end cases: shore creates fictional crew/course/rule/session, vessel officer records attendance and assessment, approver verifies certificate, readiness becomes `ready`; also test unrelated vessel isolation and stale concurrent edit.
- [ ] Run `npm test`; expect PASS, including existing Operations and document tests.
- [ ] Apply `002_training.sql` to an isolated preview database, test desktop and mobile with fictional data, confirm anonymous view has no training data and the complete shore/onboard flow works. Keep production empty until migration and grants are verified.
- [ ] Review diff for secrets and personal data, inspect Vercel preview build/logs, then merge/deploy and verify Production with fictional records only.
- [ ] Commit any release-only fixes and README: `test: verify crew training trial end to end`.

## Separate follow-on plans

Phase 2 receives its own plan for approvals beyond matrix/certificate checks, notifications, costs, reports and travel/hotel references. Phase 3 receives a plan for ranked proposals, scenarios, offline sync/conflict review and optional AI drafts. Neither phase is a prerequisite for completing this online trial.

