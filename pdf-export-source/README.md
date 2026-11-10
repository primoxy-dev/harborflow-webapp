# HarborFlow PDF export

The generated `../pdf-vector.js` runs entirely in the browser. It records the
same Canvas commands used for document previews and replays English text and
drawing paths into PDF. Thai and other scripts requiring browser shaping are
embedded as tightly cropped transparent images at the original rendering scale.
No document data is sent to a PDF service.

Build from the repository root:

```
npm ci --prefix pdf-export-source --ignore-scripts
node pdf-export-source/build.mjs
```

The browser downloads this checked-in bundle, including in offline mode.
The existing canvas-to-JPEG exporter remains available if the bundle is absent.
An error in an active vector export is reported rather than silently producing
a different document.

The GAC paths come from the existing user-supplied vector logo in the quotation
template. `extract-logo.mjs` regenerates the path data from that source.
Signature images are converted locally into horizontal ink runs. This preserves
the source pixel boundaries rather than smoothing them: low-resolution input
retains its original jagged edges. The user must compare the original and vector
and explicitly approve before every download. Cancelling stops the download.
The original stored signature is never replaced by the trace.

OKTB, LOI and Terminal Permit downloads read the original visible HTML document
layout, including its browser fonts, text positions, wrapping and spacing. The
live preview is never replaced. Text is embedded as tightly cropped 3× PNGs to
preserve the original typefaces; this is the user's chosen preference over vector
English text in these three documents. Shared table borders are merged and drawn
once as vector lines. Logos and approved signatures remain vector paths. The page
is fitted proportionally onto A4 without stretching and centered horizontally
and vertically so unused page space is distributed evenly.
Terminal Permit uses top alignment instead of vertical centering, with its
smaller live-page top padding, to avoid a large blank area above the letterhead.

Exports use an isolated 800px-wide document and a 1200px capture viewport, rather
than the phone's visible panel size. Text autosizing is disabled on document
content. This keeps exported layout independent of responsive panels, ancestor
transforms, horizontal scroll and mobile text inflation.

Table borders and canvas dimensions must be measured in html2canvas's `onclone`
callback, after the capture document has laid out and its fonts are ready.
Measurements from the original mobile document can differ from that capture and
must not be mixed with captured text coordinates.

Regression test (requires Playwright/Chromium, or `PLAYWRIGHT_MODULE` and
`CHROME_PATH` pointing to an existing installation):

```
node --test pdf-export-source/tests/mobile-layout.browser.mjs
```

The test forces viewport-dependent text reflow before export, then compares the
rendered mobile and desktop PDFs pixel for pixel to catch shifted table borders.

Summary, Calendar and legacy Quotation retain the common vector writer. The
existing React PDF quotation editor uses its own vector renderer and is unchanged.

Dependency licenses are collected in `THIRD_PARTY_LICENSES.txt`.
