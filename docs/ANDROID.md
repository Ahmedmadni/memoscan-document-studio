# Android (Capacitor) notes

The app is pure client-side (canvas + IndexedDB + jsPDF), so it can be wrapped with Capacitor as-is.
Native capabilities that will need plugins later:

- Live camera uses WebView `getUserMedia`, with a portrait view, consecutive captures and per-page approval. The system camera input is a fallback if WebView access fails.
- Camera orientation uses `@capacitor/screen-orientation` while open and unlocks on exit. Torch and zoom use track capabilities and are unavailable when the device/WebView does not expose them; torch is continuous light, not a synchronized still-photo flash.
- PDF exports use `@capacitor/filesystem` application cache and `@capacitor/share`; save a permanent copy via the share sheet.
- Faster / more robust edge detection: optional OpenCV native or WASM module.
- Storage persistence: IndexedDB in the WebView works but can be cleared with app data.
- Camera batches use a counted review icon rather than a live thumbnail strip. Review opens page editing before approval; white-paper, clear-text and optional mild curved-edge correction all use the same browser pixel pipeline on Android. Test these controls on a physical device; severe folds/hidden text are not reconstructed.
