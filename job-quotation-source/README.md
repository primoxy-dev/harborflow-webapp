# HarborFlow Job quotation editor

This editor incorporates the actual EasyInvoicePDF form, calculations and Default/Stripe vector PDF templates from **VladSez/easy-invoice-pdf**, reviewed commit **89ec1bd429bbaa27b8d5a7afd243cd029462da09**. Copyright (C) 2024-present ULADZISLAU SAZONAU. It is provided under GNU AGPL v3; see [LICENSE](LICENSE).

The source used by the build is included under `vendor/src/`; these files include HarborFlow changes to the editor, quotation item table, and PDA template; `config.ts` points font URLs to bundled local fonts. `entry.tsx`, `shims.ts`, `style.css`, `server-schema.ts` and `build.mjs` are HarborFlow integration changes. The complete dependency manifest, lockfile, original PDF dependency pins and original fontkit patch are included. Browser-persistence helpers are adapted to a per-editor in-memory store, saved with this Job through the authenticated API. Sentry and analytics calls are disabled. The original PDF templates remain available alongside the added PDA template. `vendor-buffer/` contains the MIT-licensed buffer 6.0.3, base64-js 1.5.1 and ieee754 1.2.1 browser shims with their licenses, verified against npm registry integrity hashes; these support uploaded images and QR decoding without Node globals.

## Rebuild

Use Node.js 22+ and pnpm. Review `package.json`, `pnpm-workspace.yaml` and `patches/README.md` before installing. From this directory, run `pnpm install --frozen-lockfile` then `pnpm run build`. esbuild's executable must be available (normal trusted package installation supplies it). The build writes `../job-quotation/` and `../lib/job-quotation-schema.mjs`. Initial builds fetch the five font files listed in `build.mjs` from the upstream font host; subsequent builds reuse them. No runtime secrets are needed. Keep the PDF package overrides and fontkit patch: removing them causes missing-font errors and dropped accented characters.

The deployed editor footer links to this corresponding source. Dependencies and their license notices accompany the static output in `editor.js.LEGAL.txt`; PDF.js has its own license header. Font licenses are bundled alongside the fonts.

## Integration

`../job-quotation.js` opens an iframe within the vessel Job dialog. It does not navigate to or use the Commercial quotation UI/API. The server endpoint is `../api/job-quotation.mjs`, protected by the signed-in Operations Job permissions and same-origin POST checks. Documents and seller/buyer profiles live in separate, versioned Job quotation tables. Copying a Job link does not grant access or embed financial details in the URL.

The viewer rasterizes the shared vector PDF at **2048 pixels wide per page** for preview only. Download uses the original vector PDF Blob, including embedded font subsets and the original-resolution uploaded logo/QR image. A PDF has physical page dimensions rather than a fixed pixel count; vector text remains sharp when rendered beyond 2K.
