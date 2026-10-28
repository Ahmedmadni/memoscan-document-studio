# Open-source feature review for MemoScan

This note records implementation ideas reviewed for MemoScan. It is not a claim that code from these projects has been copied.

## References reviewed

- [Scancat](https://github.com/nipunbatra/scancat) — browser-only camera workflow, multi-page tray, perspective correction, local-lighting normalization, filters, PDF export, and synthetic/headless camera tests. Its README states that the project is MIT-licensed.
- [DocScanner](https://github.com/Vvek07/DocScanner) — OpenCV.js-based boundary detection, perspective correction, before/after comparison, and local-first storage. The repository describes its project as MIT-licensed; verify the current LICENSE file before reusing any code.
- [FOSScanner](https://github.com/FOSScanner/fosscanner-app) — mobile scanner workflow, editable corners, sequential capture, multi-page ordering, filters, and on-device processing.

## Ideas being applied to MemoScan

1. Capture a sequence of pages inside the app, then review and remove captures before importing them into a document.
2. Reduce uneven paper lighting with a local luminance estimate; this has been added as the optional **Paper shadow cleanup** filter.
3. Reject crossed or collapsed corner geometry instead of allowing an invalid quadrilateral to reach perspective correction.
4. Keep the original image available and preserve the existing before/after comparison, undo/redo, manual corner handles, and local-only processing.

## Licensing and privacy guardrails

- Do not copy implementation code, icons, screenshots, or assets from another project without checking its exact license and notice requirements.
- Prefer independent implementations of algorithmic ideas. If a dependency or code is adopted later, record its source, version/commit, license, required notices, and bundle-size impact.
- Keep all document images and processing on the device. Do not add cloud OCR, analytics, uploads, or paid services without explicit product approval.
- Computer-vision heuristics must be validated on varied real photos (white and dark backgrounds, curved pages, shadows, rotated pages, receipts, and pages near image edges). A successful build alone does not prove detection quality.
