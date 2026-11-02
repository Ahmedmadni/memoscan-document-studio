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
