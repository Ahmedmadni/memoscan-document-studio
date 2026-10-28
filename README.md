# MemoScan Document Studio

Build a new project from scratch named "MemoScan" (Arabic UI name: ماسح ميمو) in this workspace. This is a professional document-scanning web app designed to be mobile-first and architected for later Android packaging with Capacitor. Do not connect paid services, add paid APIs, or create external costs. Prefer offline/local processing and browser APIs; do not add a backend or authentication unless genuinely required.

PRODUCT PRIORITIES — functional scanning quality comes before decorative UI:
1) A polished, responsive Arabic RTL interface (with a clear Arabic/English language toggle), light-first modern design, accessible contrast, mobile-friendly controls, and a coherent design system.
2) A working scan workflow: import image(s) from device and use camera capture where browser support permits; preview each page; allow manual four-corner adjustment; rotate/crop; reorder, duplicate, replace, and delete pages; undo/redo where feasible.
3) Implement actual client-side image processing, not mocked controls: perspective correction using a reliable browser-compatible library if feasible, deskew/rotation, grayscale, black-and-white threshold, color enhancement, brightness/contrast and sharpening controls, and before/after comparison. Detect paper edges automatically where feasible; if automatic detection cannot be robustly completed, provide clear manual corner editing and label automatic detection honestly. Do not pretend a perspective transform works if it is only a CSS crop.
4) Multi-page document workspace with local persistence (IndexedDB or another appropriate local approach), thumbnails, rename, create/open/delete documents, and graceful empty/loading/error states.
5) Export real multi-page PDF in selectable quality/compression settings, download/share using supported browser capabilities, with a clear fallback when native sharing is unavailable. Do not upload user documents to a server.
6) Add a concise in-app privacy note explaining processing/storage behavior, plus useful onboarding and a demo-free empty state. Do not seed fake documents or fabricate results.

ENGINEERING:
- Inspect the generated starter project and build a maintainable component structure.
- Use real types and sensible error handling. Avoid placeholder buttons and fake success messages.
- Keep dependencies browser-compatible and suitable for future Capacitor integration. Document any native Android capabilities that will require a later Capacitor plugin or native implementation.
- Do not claim tests passed unless actually run. At the end, report what was implemented, what is incomplete, and any build/test results that are genuinely available.
- Start by implementing the core working flow end-to-end, then refine UI.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/699316fb-b881-46d8-a4a8-1701c1d40419).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
