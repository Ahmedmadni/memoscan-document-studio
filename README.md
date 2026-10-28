# Waraqah — ورقة

Waraqah is a professional document-scanning app designed for Arabic-first mobile use, with an English interface option and Android packaging through Capacitor.

**Tagline:** From paper to a polished file — in seconds.  
**الشعار:** من الورق إلى ملف جاهز — في ثوانٍ.

## Product priorities

1. A polished, responsive Arabic RTL interface with an Arabic/English language toggle, accessible contrast, mobile-friendly controls, and a coherent design system.
2. A working scan workflow: import images, capture pages with the in-app camera where supported, preview pages, adjust four corners, rotate, reorder, duplicate, replace, and delete pages.
3. Real client-side image processing: perspective correction, rotation, grayscale, black-and-white threshold, color enhancement, brightness/contrast, sharpening, and honest communication about automatic edge-detection limitations.
4. A multi-page document workspace with local persistence (IndexedDB), thumbnails, rename, create/open/delete documents, and graceful empty/loading/error states.
5. Multi-page PDF export with quality options, download/share support and fallbacks. User documents must not be uploaded to a server.
6. A clear in-app privacy note explaining local processing and storage. Do not seed fake documents or fabricate results.

## Engineering

- Keep the code maintainable and browser-compatible with Capacitor.
- Document any native Android capabilities requiring a Capacitor plugin or native implementation.
- Do not claim tests passed unless actually run. Report verified build/test results and remaining limitations accurately.

## Development

This project was built with Lovable. Continue development in the Lovable editor at https://lovable.dev/projects/699316fb-b881-46d8-a4a8-1701c1d40419.

The Android application ID remains com.ahmedelmadni.memoscan intentionally. Keeping the ID unchanged allows the rebranded build to retain the same Android package identity; the display name is now Waraqah.
