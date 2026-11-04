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
    await screen.orientation?.lock("portrait");
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
