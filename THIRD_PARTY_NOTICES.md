# EasyInvoicePDF reference

The Job quotation editor follows EasyInvoicePDF's document-editing workflow: configurable document details, template selection, a live customer preview, and PDF export from the same workspace. The shared preview/export rendering approach was reviewed in `src/app/(app)/contexts/invoice-pdf-instance-context.tsx`.

- Project: https://github.com/VladSez/easy-invoice-pdf
- Reviewed source: `89ec1bd429bbaa27b8d5a7afd243cd029462da09`
- Copyright (C) 2024-present ULADZISLAU SAZONAU
- Upstream license: GNU Affero General Public License v3.0, preserved in `docs/licenses/EasyInvoicePDF-AGPL-3.0.txt`.

HarborFlow's integration is implemented in its existing JavaScript and canvas/PDF stack. No upstream React templates, server endpoints, telemetry, profile storage, or runtime dependencies are bundled. The reviewed upstream checkout is retained separately during development; this notice does not relicense unrelated HarborFlow code.
