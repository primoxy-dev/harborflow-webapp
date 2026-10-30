# EasyInvoicePDF reference

The Job quotation editor follows EasyInvoicePDF's document-editing workflow: configurable document details, template selection, a live customer preview, and PDF export from the same workspace. The shared preview/export rendering approach was reviewed in `src/app/(app)/contexts/invoice-pdf-instance-context.tsx`.

- Project: https://github.com/VladSez/easy-invoice-pdf
- Reviewed source: `89ec1bd429bbaa27b8d5a7afd243cd029462da09`
- Copyright (C) 2024-present ULADZISLAU SAZONAU
- Upstream license: GNU Affero General Public License v3.0, preserved in `docs/licenses/EasyInvoicePDF-AGPL-3.0.txt`.

The independent Job editor now bundles the original React form and Default/Stripe vector PDF templates, with source and integration changes under `job-quotation-source/`, licensed under AGPL-3.0. The runtime links to that corresponding source. Browser persistence is replaced by Job-scoped server saving, and telemetry is disabled. The Commercial quotation editor is unchanged. See `job-quotation-source/README.md` for build requirements, dependency pins, fontkit patch and the precise modifications.
