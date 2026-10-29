# Android build (Capacitor)

## Current status

Waraqah uses TanStack Start with SPA shell prerendering and Capacitor 8. Capacitor is configured with `webDir: ".output/public"`. The Android build requires `.output/public/index.html` and client-side routes working locally. The GitHub Actions workflow checks this before creating/building Android. If it fails, fix SPA/static output rather than bypassing the check or packaging server-only output.

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
