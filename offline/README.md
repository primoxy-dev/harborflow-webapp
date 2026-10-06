# Trial document workspace

Open `/offline/` online once, wait for the ready indicator, then the same URL works without network access. The static service worker is restricted to `/offline/` and an explicit public asset list. It never caches APIs, the authenticated main app, or server data.

The normal online Job and permission workflow is unchanged. The offline workspace uses manually entered fictional data only, not a snapshot of the authorized server roster. It does not synchronize anything. Approvals remain online.

All three renderers and browser PDF exporters are reused. Roster and flight input, editable template fields, local signatures and contact fields are in memory until the user explicitly saves. Saving requires acknowledgment of fictional-data-only use. IndexedDB drafts are unencrypted, device/browser-local, retained up to seven days and purged when next accessed after expiry. Opening an old draft requires confirmation. Writes use a version check within one transaction to avoid silent overwrite from concurrent tabs. Deleting clears both the stored draft and current workspace, but cannot delete downloaded PDFs or device backups. Private browsing/storage eviction may remove drafts sooner.

Before allowing real personal data offline, agree and test device encryption, access controls, expiry of offline access, shared-device handling, permanent deletion and backup retention. Real private defaults from Production are deliberately not downloaded into this workspace.

This is trial functionality; offline PDF outputs retain the existing SAMPLE / NOT APPROVED watermark. No AI, third-party processing, new database, or automatic server upload is involved.
