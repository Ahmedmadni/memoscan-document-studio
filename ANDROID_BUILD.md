# Android build (Capacitor)

## Current status

Waraqah uses TanStack Start with SPA shell prerendering and Capacitor 8. Capacitor is configured with `webDir: ".output/public"`. The Android build requires `.output/public/index.html` and client-side routes working locally. The GitHub Actions workflow checks this before creating/building Android. If it fails, fix SPA/static output rather than bypassing the check or packaging server-only output.

Verified on 2026-11-02: GitHub `main` at `6b29ffb466b5c70a65fab93b0208532e17f1e9dc` completed [Android workflow run 41412768817](https://github.com/Ahmedmadni/memoscan-document-studio/actions/runs/41412768817). All steps, including Gradle `assembleDebug`, APK existence, and artifact upload, succeeded. Its `waraqah-android-debug-apk` artifact is 5,164,038 bytes (ZIP archive), retained for 14 days. This verifies that revision only, not subsequent changes or physical-device behavior. The debug APK is a testing artifact, not a signed Play Store release.

The editing sandbox has no JDK or Android SDK and no generated `android/` folder. CI generates the Android platform from the installed Capacitor packages. No local Gradle build or physical-device verification is claimed.

## Requirements

- Node.js 22 or the version supported by the repository
- Bun (the repository lockfile is `bun.lock`)
- Android SDK / Android Studio for a local APK build
- JDK 21 (Capacitor 8 / current Android Gradle Plugin requirements)

## Local commands

```sh
bun install --frozen-lockfile
bun run test
bun run lint
bun run build
```

Verify the expected web entry point before running Capacitor:

```sh
test -f .output/public/index.html || (echo "Missing .output/public/index.html: configure a supported static/SPA build before packaging" && exit 1)
```

Only after the check passes:

```sh
bunx cap add android       # only once; creates android/
bunx cap sync android      # repeat after web or plugin changes
bunx cap open android
```

In Android Studio, wait for Gradle sync, select the debug build variant, then use **Build > Build Bundle(s) / APK(s) > Build APK(s)**. The debug APK is normally at `android/app/build/outputs/apk/debug/app-debug.apk`.

## GitHub Actions

The workflow `.github/workflows/android-debug-apk.yml` runs the web checks, verifies the local web entry point, creates the Android project if needed, syncs Capacitor, builds a debug APK, and uploads it as an Actions artifact. If it stops at the entry-point check, that is a genuine architecture/build-output blocker, not a successful APK build.

## Device validation still required

A successful CI APK build does not verify a physical device. Install the APK on an Android phone and check camera capture, image import, IndexedDB persistence after force-close/reopen, PDF export, and native share sheet. Do not request broad storage permissions unless a feature demonstrably needs them.

Also check multi-shot camera capture after accepting/cancelling a crop, navigation and Android Back, signature preview/placement, share-sheet cancellation, Arabic/English switching, and offline startup. Native PDF exports are written to application cache and offered to the system share sheet; explicitly save a permanent copy there. Image processing limits output dimensions after decoding; full-resolution decode still depends on device memory. Test large phone photos on a low-memory device before release.

## Latest verified CI result

- Commit `3c9323f37925ba559b3cc0353405c2f4c18865ef`: GitHub Actions run [41618669198](https://github.com/Ahmedmadni/memoscan-document-studio/actions/runs/41618669198) completed successfully (tests, lint, web build, Capacitor sync, Gradle `assembleDebug`).
- Artifact `waraqah-android-debug-apk` (~5.2 MB) was uploaded, retained 14 days.
- Local checks for the same code: Prettier clean, typecheck clean, 70/70 Vitest tests passed, ESLint 0 errors (7 existing warnings), production build succeeded.
- Not yet tested on a physical Android device.

## Physical device test checklist

Download the artifact from the run page, unzip, and install `app-debug.apk` (allow "install unknown apps").

Camera:

1. Open **Scan**, tap camera; accept the camera prompt. Expect the system camera to open.
2. Take a photo, then take a second one; both pages appear in order.
3. Cancel the camera once; the app stays on Scan with no error.
4. Deny the permission; a clear message appears and gallery import still works.
5. Adjust the four corners by touch, save, and confirm the corrected page.
6. Force-close the app and reopen; the document is still in **Documents**.

Signature:

1. Open **Sign**, choose a multi-page PDF, select page 2.
2. Draw a signature with a finger; then try importing a PNG with transparency.
3. Drag and resize the signature on the preview; rotate the phone and confirm it stays in place.
4. Export; open the new PDF and confirm the signature sits in the same spot, only on page 2, and the original file is unchanged.
5. Share the PDF, then cancel the share sheet; the app remains usable.

General: Android Back on each page, Arabic/English switch, airplane-mode start, and a large photo on a low-memory phone.

## Portrait batch camera update (2026-11-04)

Current source adds a portrait camera, a large circular shutter, consecutive captures without per-shot interruption, and mandatory approval of each page before adding a batch. Startup no longer waits for orientation/status-bar operations; live edge sampling is reduced. Actual startup time depends on permission prompts and hardware and has not been benchmarked on a phone.

The same camera is bundled into Android by the existing workflow. `@capacitor/screen-orientation` locks portrait only while the camera is open. Torch (continuous light), zoom and camera switching depend on the camera/WebView capabilities. Unsupported torch is disabled; unsupported zoom is omitted. No broad storage permission is added. No APK build or physical-device verification for these changes is claimed.

Additional phone checks for the new build:

1. Open Scan and the camera with permissions granted, then with permission denied. Check the device-camera fallback and gallery import.
2. Confirm portrait while capturing; close the camera and confirm other pages can rotate normally.
3. Capture three pages consecutively: live preview must remain open after each shot. Open Review, adjust corners, approve each page, and confirm Add is disabled until every remaining page is approved.
4. Navigate between previews, delete one, resume shooting and add another. Approve remaining pages; verify their order in Documents and exported PDF after reopening the app.
5. Test torch on/off and zoom on a device that exposes them; switch front/back and confirm unsupported controls reset. Close the camera and check that its light and privacy indicator turn off.
6. Cancel while capture or approval is pending, reopen and confirm no old pages appear. Repeat in Arabic and English, and after backgrounding/resuming.

Obtain the updated APK only from a successful Actions run whose commit contains these changes; an older successful run does not verify this revision. Install and follow the checks above before release.

Checks run for the camera update: 75/75 Vitest tests passed; Prettier check passed; ESLint reported 0 errors and 7 existing warnings. The preview reported build OK. A Chromium synthetic camera test captured two pages without interruption, approved both, added them to Documents and reopened the saved document without runtime errors. This synthetic browser camera does not verify physical camera quality, hardware torch/zoom, native permissions or an Android APK.
