# Knowledge base emergency recovery (trial)

The web app deliberately offers no emergency administrator or restore button to a backup administrator. This procedure is for a time when the owner `primoxy-dev` cannot act.

1. Two people with repository-level authority independently verify the incident, the requester's identity, and the exact GitHub account to receive temporary access. Record both reviewers and the reason in a private issue or change record.
2. Review the current private `Knowledge/terminal-access.json`, the affected terminal or contact file, and their GitHub commit history. Keep Contact content within the restricted reviewer group.
3. The two reviewers approve the exact ACL change or data restoration in writing before a repository maintainer applies it. Neither reviewer may approve their own elevation alone.
4. Apply one scoped change, verify it with a fresh login and a read-only check, then record the resulting commit and notify the owner when reachable.
5. Remove temporary access after the incident and review the audit trail.

No reviewers have been appointed for the trial. Appoint them and rehearse this process before operational use. This procedure does not grant access to crew documents.

