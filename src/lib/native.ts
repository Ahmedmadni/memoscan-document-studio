// Native (Capacitor) integration. Everything here is a no-op in the browser,
// so the web experience is unchanged; on Android these use Capacitor plugins.
import { Capacitor } from "@capacitor/core";

export const isNative = () => Capacitor.isNativePlatform();

/** Pick the router history: hash-based inside the Capacitor WebView (its local
 *  file server has no SPA fallback), browser history on the web. */
export function pickHistory<T>(nativeHistory: T, webHistory: T, native = isNative()): T {
  return native ? nativeHistory : webHistory;
}

/** Light status bar matching the app background; safe to call anywhere. */
export async function configureStatusBar() {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: "#faf9f5" });
  } catch {
    // Plugin unavailable (e.g. web preview) — ignore.
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK)
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  return btoa(bin);
}

/**
 * Save a PDF on Android via the Filesystem plugin and return its file URI.
 * Browser callers keep using the existing download/share path instead.
 */
export async function savePdfNative(blob: Blob, filename: string): Promise<string> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
    recursive: true,
  });
  return uri;
}

/** Open the native share sheet for a previously saved file URI. */
export async function shareFileNative(uri: string, title: string): Promise<void> {
  const { Share } = await import("@capacitor/share");
  await Share.share({ title, url: uri, dialogTitle: title });
}
