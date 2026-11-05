# Final Waraqah stabilization

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
