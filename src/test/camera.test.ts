import { describe, expect, it, vi } from "vitest";
import {
  batchApproved,
  cameraControls,
  portraitCamera,
  releaseCameraOrientation,
  setCameraControl,
} from "@/lib/camera";

const mocks = vi.hoisted(() => ({ native: false, lock: vi.fn(), unlock: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => mocks.native } }));
vi.mock("@capacitor/screen-orientation", () => ({
  ScreenOrientation: { lock: mocks.lock, unlock: mocks.unlock },
}));

describe("camera rules", () => {
  it("requires every captured page to be approved before importing the batch", () => {
    const a = new File(["a"], "1.jpg");
    const b = new File(["b"], "2.jpg");
    expect(batchApproved([a, b], new Set([a]))).toBe(false);
    expect(batchApproved([a, b], new Set([a, b]))).toBe(true);
    expect(batchApproved([], new Set())).toBe(false);
  });
  it("does not expose unsupported torch or zoom", () => {
    expect(cameraControls({} as MediaStreamTrack)).toEqual({ torch: false, zoom: null });
    expect(
      cameraControls({
        getCapabilities: () => ({ torch: false, zoom: { min: 1, max: 1 } }),
      } as unknown as MediaStreamTrack),
    ).toEqual({ torch: false, zoom: null });
  });
  it("applies supported light and zoom settings to the active track", async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const track = {
      getCapabilities: () => ({ torch: true, zoom: { min: 1, max: 4, step: 0.1 } }),
      applyConstraints,
    } as unknown as MediaStreamTrack;
    expect(cameraControls(track)).toEqual({ torch: true, zoom: { min: 1, max: 4, step: 0.1 } });
    await setCameraControl(track, "torch", true);
    await setCameraControl(track, "zoom", 2);
    expect(applyConstraints).toHaveBeenNthCalledWith(1, { advanced: [{ torch: true }] });
    expect(applyConstraints).toHaveBeenNthCalledWith(2, { advanced: [{ zoom: 2 }] });
  });
  it("locks Android camera to portrait and unlocks on exit", async () => {
    mocks.native = true;
    await portraitCamera();
    expect(mocks.lock).toHaveBeenCalledWith({ orientation: "portrait" });
    await releaseCameraOrientation();
    expect(mocks.unlock).toHaveBeenCalled();
    mocks.native = false;
  });
});
