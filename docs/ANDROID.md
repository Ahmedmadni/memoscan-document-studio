# Android (Capacitor) notes

The app is pure client-side (canvas + IndexedDB + jsPDF), so it can be wrapped with Capacitor as-is.
Native capabilities that will need plugins later:

- Live camera with real-time edge overlay: `@capacitor/camera` (or a camera-preview plugin); today we use `<input capture>`.
- Saving PDFs to device storage: `@capacitor/filesystem` (WebView blob downloads are unreliable on Android).
- Native share sheet with files: `@capacitor/share` (Web Share with files varies by WebView).
- Faster / more robust edge detection: optional OpenCV native or WASM module.
- Storage persistence: IndexedDB in the WebView works but can be cleared with app data.
