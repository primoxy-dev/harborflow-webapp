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

OKTB, LOI and Terminal Permit live previews use the same page layout functions
as downloads. Their old HTML remains hidden as the data binding source, and is
shown if the shared preview cannot be rendered. Summary, Calendar and legacy
Quotation use the common vector writer. The existing React PDF quotation editor
already uses its own vector renderer and is unchanged.

Dependency licenses are collected in `THIRD_PARTY_LICENSES.txt`.
