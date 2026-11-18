# Final Waraqah stabilization

## Data protection and recovery

- [x] Commit related storage writes atomically and start deletion timers only after successful writes; guard finalized deletion against restored references.
- [x] Persist camera drafts, edits and approvals, keep failed imports for retry, and avoid duplicate captures when resuming an interrupted import.
- [x] Export full document/image backups, verify checksums before restore and add independent copies atomically.
- [x] Preserve supported source image bytes independently from bounded processing previews.
- [x] Correct Arabic watermark export, use real SHA-256 on fallback platforms, reject impossible invoice dates and warn about contradictory monetary values.
- [x] Use honest notes labels and collapse secondary notes/invoice tools in the document workspace.
- [x] Pin the previously successful Bun version and check formatting/types without rewriting source during CI.
- [x] Add per-stroke signature undo/redo/eraser, adjustable smoothing, a larger drawing area and ink-cropped preview. Undo history is session-local (up to 50 edits); imported images and stamps remain raster assets.
- [ ] Add on-device OCR and an invoice history/export workflow.
- [ ] Resolve Android signing continuity before distributing an installed-app update. Verified builds 119 and 120 use different debug signing certificates; build 120 is for a separate test device.
- [ ] Verify current production camera, storage and sharing flows on a physical Android phone. Local browser automation is currently blocked by Chromium's process socket restriction; automated component/storage regressions are available.

## Visual identity refinement

- [x] Refine camera, review and editor layouts. Verified capture, editing, approval and PDF export at 320×568 in Arabic and 390×844 in English using a simulated camera stream.

- [x] Refine shared colors, navigation and headings; refresh home and scan presentation without changing workflows.
- [x] Check mobile/desktop Arabic and English layouts and run existing regressions (87 tests; browser import and PDF creation verified).

- [x] Preserve separate feature pages, bilingual identity, library search and sorting.
- [x] Finish small mobile layout adjustments and verify Arabic/English pages.
- [ ] Verify camera, signing and native navigation on a physical Android phone (blocked: no device available).
- [x] Resolve lint/format failures and run regression/browser checks.
- [x] Verify GitHub main and latest Android workflow/artifact through public API.
- [x] Update Android release notes with verified CI status and remaining physical-device checks.

## Portrait batch camera

- [x] Improve Scan entry and shutter; capture continuously, then review and approve each page.
- [x] Add supported torch, zoom and camera switching; remove startup waits and add native portrait lock.
- [x] Run camera regressions and browser flow; update Android device checks without claiming device verification.
- [ ] Verify a new Android APK containing these changes (blocked: pending GitHub sync/Actions run; no local SDK).

## Paper cleanup and compact capture review

- [x] Add local paper whitening, text clarity and conservative curved-edge background cleanup with regression tests.
- [x] Replace live camera thumbnail strip with a counted review icon; preserve per-page editing and approval.
- [x] Verify processing and batch review in tests and the mobile browser; state dewarping and Android limitations honestly.
