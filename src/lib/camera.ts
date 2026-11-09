import { isNative } from "./native";

export type CameraCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: { min: number; max: number; step: number };
};

export function cameraControls(track: MediaStreamTrack) {
  const caps = track.getCapabilities?.() as CameraCapabilities | undefined;
  const zoom = caps?.zoom;
  return {
    torch: caps?.torch === true,
    zoom:
      zoom && Number.isFinite(zoom.min) && Number.isFinite(zoom.max) && zoom.max > zoom.min
        ? zoom
        : null,
  };
}

export async function setCameraControl(
  track: MediaStreamTrack,
  key: "torch" | "zoom",
  value: boolean | number,
) {
  await track.applyConstraints({ advanced: [{ [key]: value } as MediaTrackConstraintSet] });
}

/** Native orientation must use the plugin; browser locks are best-effort. */
export async function portraitCamera() {
  if (isNative()) {
    const { ScreenOrientation } = await import("@capacitor/screen-orientation");
    await ScreenOrientation.lock({ orientation: "portrait" });
  } else {
    const orientation = screen.orientation as
      (ScreenOrientation & { lock?: (value: "portrait") => Promise<void> }) | undefined;
    await orientation?.lock?.("portrait");
  }
}

export async function releaseCameraOrientation() {
  if (isNative()) {
    const { ScreenOrientation } = await import("@capacitor/screen-orientation");
    await ScreenOrientation.unlock();
  } else {
    screen.orientation?.unlock();
  }
}

export function batchApproved(files: File[], approved: Set<File>) {
  return files.length > 0 && files.every((file) => approved.has(file));
}

/** Matches the centered 3:4 viewfinder, without stretching or upscaling. */
export function portraitFrame(width: number, height: number) {
  const frameWidth = Math.min(width, (height * 3) / 4);
  const frameHeight = Math.min(height, (width * 4) / 3);
  return {
    x: (width - frameWidth) / 2,
    y: (height - frameHeight) / 2,
    width: frameWidth,
    height: frameHeight,
  };
}
