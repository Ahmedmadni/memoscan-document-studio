# Android (Capacitor) notes

The app is pure client-side (canvas + IndexedDB + jsPDF), so it can be wrapped with Capacitor as-is.
Native capabilities that will need plugins later:

- Live camera uses WebView `getUserMedia`, with a portrait view, consecutive captures and per-page approval. The system camera input is a fallback if WebView access fails.
- Camera orientation uses `@capacitor/screen-orientation` while open and unlocks on exit. Torch and zoom use track capabilities and are unavailable when the device/WebView does not expose them; torch is continuous light, not a synchronized still-photo flash.
- PDF exports use `@capacitor/filesystem` application cache and `@capacitor/share`; save a permanent copy via the share sheet.
- Faster / more robust edge detection: optional OpenCV native or WASM module.
- Storage persistence: IndexedDB in the WebView works but can be cleared with app data.
- Capture sessions now persist locally, including edits and approvals. Test closing/reopening the app before import and interrupting a partial import; the resumed session must reuse its target document without duplicating committed captures.
- Complete `.waraqah` backups are available in Settings. Restore verifies every image checksum before adding independent document copies. Test export/share, file selection, damaged-file rejection and restore after reinstall. The signature vault and unimported capture drafts are excluded explicitly.
- IndexedDB v2 upgrades existing v1 data without changing the app ID. Automated migration coverage is included; verify an actual APK update preserves installed documents before distribution.

## Verified build 120 distribution constraint

Build 120 (`9fa2e3b6be3448a26b37165e4851c1dc4b587acf`) passed the 112 tests, type/format/lint checks and Android debug assembly. The APK contains the new backup interface. A physical device and the current local Chromium automation environment were unavailable for end-to-end device verification.

The APK signing-block certificates differ between builds 119 and 120: build 119 SHA-256 starts `e2c88c3327ce5882`, build 120 starts `845f42d1aed897e6`. Thus build 120 cannot replace build 119 as an ordinary installed-app update. Use a separate test device; do not uninstall an existing installation containing documents to try this APK. Keeping the same application ID is insufficient when the certificate changes.

Release signing was skipped because `ANDROID_KEYSTORE_BASE64` is not configured. A future in-place update requires the original installed application's signing key, followed by a stable signing configuration. A newly generated key alone cannot update an installation signed with the old key. Test a user-data migration path before changing distribution keys.
- Camera batches use a counted review icon rather than a live thumbnail strip. Review opens page editing before approval; white-paper, clear-text and optional mild curved-edge correction all use the same browser pixel pipeline on Android. Test these controls on a physical device; severe folds/hidden text are not reconstructed.
