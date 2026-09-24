# Separate public terminal restrictions from private contacts

Status: accepted; implementation in progress.

The experimental Knowledge base will publish all Terminal Restriction fields, including notes and sources, for anyone to read without signing in. Terminal Contacts will be stored separately and shown only to the owner and explicitly named users who sign in. This keeps terminal guidance easy to share while limiting exposure of personal contact details; publishing a field is difficult to undo once someone has read or copied it.

Editing Terminal Restrictions, viewing Terminal Contacts, and editing Terminal Contacts are three independent grants. A Knowledge Base Administrator may manage these grants but receives no data grant or crew-record access automatically. Only the owner may appoint or remove another Knowledge Base Administrator. Revocation takes effect on the next request. The public form must continuously indicate that Terminal Restriction content is public.

During the trial, ordinary authorized edits publish immediately with an attributable change history. Existing browser-only data enters the shared store only after a private proposal is reviewed in full and approved by the owner. Concurrent changes must not silently overwrite each other. If the store is temporarily unavailable, the public Terminal Restriction view may show a clearly marked last-known copy, but private Contacts must not be shown without a current access check.

Only people with a relevant data grant may submit import proposals. Terminal Restriction and Terminal Contact proposals stay separate; the owner approves or rejects individual entries. For an entry that matches an existing record, the owner explicitly chooses add, replace, or reject after viewing the difference; a replacement retains a reference to its proposal. Public viewers see only an update time. The owner and Knowledge Base Administrators may see change actors, but Contact before/after content remains hidden from an administrator without a separate Contact-view grant. Public stale Terminal Restrictions may remain visible for at most 24 hours with the last-sync time and an instruction to confirm with the terminal. Editors resolve concurrent changes item by item; there is no whole-table overwrite action.

The trial uses fictional or de-identified personal records until access control, deletion, and recovery have been tested. This decision does not authorize using real crew or contact details in the trial.

Only the owner may restore a prior revision as the current one; editors and administrators may inspect history only to the extent of their data grants. During the trial, deleting a fictional entry removes it from the current view but does not erase GitHub history. A permanent-deletion process must be designed and tested before real personal data is permitted. Before granting access, the owner verifies the exact GitHub profile and confirms the grant; an unconfirmed typed username receives no access.

A named Contact viewer may submit a private Contact import proposal without editing the current Contact list; the owner alone approves individual entries. If the owner is unavailable, recovery or appointment of a new administrator follows a documented emergency procedure requiring two reviewers with repository-level authority. A backup Knowledge Base Administrator cannot invoke that procedure through the web app. The reviewers and procedure must be established before operational use; none are appointed for this trial.

