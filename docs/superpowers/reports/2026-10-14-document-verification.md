# Document workflow verification — 14 October 2026

Branch: feature/document-autosave. Isolated from the dirty original checkout.
Production base: 9949bf9b59708439dda5c42dd999d61e4b1d5c70.
No merge, push, deployment, database provisioning, email sending or public publication performed.

## Delivered in the branch

- Private, revisioned common/Crew/Visitor document sections and revision history in the documents API; schema migration 003.
- In-memory autosave, explicit failure/conflict state, original/shared/local field choices, no overwrite-all.
- Collapsed Permit/LOI settings and Permit groups; one selectable-or-free-text name field, wider name column.
- LOI person selection fills and opens Personal Detail; old controls locked during delayed person changes.
- Official-directory names for 65 embassies and 29 consulates-general; ordered addressee fields with saved snapshots and editable contacts.
- Immediate authorized final OKTB/Permit/LOI PDF output without draft/sample markings; offline retains sample output.
- Export waits for saves, locks editing, and checks fresh permission/source/revisions.
- Large LOI/Permit pagination and oversized-word wrapping.

## Verification evidence

- node --test tests/*.test.mjs: 87 tests passed, zero failed.
- node scripts/document-workflow-qa.mjs: PASS using actual browser/editor/API and a fictional database fixture.
- Two isolated browser contexts opened the same revision, edited it separately, saw original/shared/local differences, explicitly resolved them and reloaded the selected value.
- Simulated 503 retained pending data without claiming a save, then explicit retry succeeded and reloaded.
- Delayed LOI switch blocked edits to the old person's form; the new person's passport was filled from its own record.
- Partial Visitor revocation during a pending common save and immediately before export cleared the old sensitive editor. Full revocation blocked every export.
- Explicit date clearing, empty rows, deleted-person projections, duplicate names, open-group persistence and 390px/768px layout covered.
- Generated actual renderer PDF Blobs: regular three documents one A4 page each; long LOI and 100-row Permit three pages each. All generated long-document pages and regular PDFs visually inspected. Offline renderer remains watermarked.
- git diff --check: no whitespace errors.

The synthetic browser origin cancels native download.saveAs; QA captures the renderer's actual PDF Blob instead. This proves PDF bytes, not native file saving.
Fixture query handlers are not Neon: no claim of verified real-database cross-device persistence, production session races or published-preview behavior.

## Independent review and fix pass

Read-only whole-branch review of 9949bf9..e87a066 found six Important and two Minor issues, no Critical.
All six Important issues fixed with regressions observed RED then GREEN:

1. Clear old Visitor content and pending queues on partial scope revocation.
2. Disable stale LOI controls during a person switch.
3. Compare removed-person document bases using the same authorized projection returned by GET, retaining revision CAS.
4. Fall back to a custom embassy name when formatted contact lines are empty.
5. Lock export controls and reject newly pending edits.
6. Character-wrap unbroken LOI text within measured paper bounds.

Empty-row resurrection was regraded Important because deletion persistence is explicit; fixed and tested.
Integration tests also exposed phantom pending state after empty flush and unchanged-section writes causing repeated conflicts; both fixed RED→GREEN.
No re-review dispatched: the single independent review is followed by the implementer's tested fix pass.

## Rulings and costs

1. Native managed-worktree creation could not resolve the chat-root repository; used an ignored manual Git worktree. Cost: manual lifecycle, no managed attachment.
2. Bash bookkeeping scripts unavailable; used PowerShell/Node and apply_patch ledger records. Cost: manual bookkeeping.
3. Corrected the old downloadAllowed=false assertion to the API's existing true contract under the newly approved immediate-download policy. Cost if wrong: different approval boundary; user explicitly removed that gate.
4. Added a pure document-form-state serialization seam to exclude account contact/signature preferences from shared records. Cost: one extra module.
5. All 94 official-source URLs inspected, only Dhaka/Singapore/New Delhi contact fields manually verified. Other 91 explicitly incomplete, never guessed. Cost: remaining contacts need manual verification.
6. Normal Permit stays one page; paginate when fitting would shrink below 80%. Cost: large tables span pages rather than becoming unreadable.
7. Capture actual renderer Blobs for synthetic-origin QA. Cost: native browser file-saving boundary remains unverified.
8. Regrade saved empty-row resurrection Important. Cost: intentionally empty tables stay empty; users add rows explicitly.
9. Real Neon/production race validation remains a release gate. Cost: no production sync claim from fixture tests.
10. No deployment performed, per the approved plan. Cost: the live website remains on its previous release.

Reviewer declined-to-judge items were explicitly retained: real Neon/production races, worldwide completeness, native file saving and deployment readiness. Their limits are stated above, not silently treated as passed.

## Deferred minor

The fresh offline LOI selector no longer bundles its former five embassy choices. Manual custom addressee works. Restore an offline-safe directory in a separate follow-up.

## Release gate

Before publishing: choose an integration path, verify an authorized preview using fictional records against real Neon, test actual browser file saving and check current deployment project/commit. Do not include the original checkout's unpublished Operations Plan or private Permit seeds.
