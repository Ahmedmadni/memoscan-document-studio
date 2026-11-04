import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImagePickers } from "@/components/ImagePickers";
import { I18nProvider } from "@/lib/i18n";

vi.mock("@/lib/imaging", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imaging")>();
  return {
    ...actual,
    loadImageCanvas: vi.fn(async () => document.createElement("canvas")),
    warpPerspective: vi.fn(() => document.createElement("canvas")),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function openCamera() {
  const stop = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })) },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:camera");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  render(
    <I18nProvider>
      <ImagePickers onFiles={vi.fn()} />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "التقاط بالكاميرا" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "التقاط صفحة" })).toBeEnabled());
  const video = document.querySelector("video");
  if (!video) throw new Error("Missing camera video");
  Object.defineProperty(video, "videoWidth", { value: 640 });
  Object.defineProperty(video, "videoHeight", { value: 480 });
  return { video, stop };
}

describe("camera review lifecycle", () => {
  it("keeps the same live video when accepting a multi-shot review", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
      callback(new Blob(["image"], { type: "image/jpeg" })),
    );
    const { video, stop } = await openCamera();
    const stream = video.srcObject;
    fireEvent.click(screen.getByRole("button", { name: "التقاط صفحة" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "مراجعة الصفحات" })).toBeEnabled(),
    );
    expect(screen.queryByRole("button", { name: "اعتماد الصفحة" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "مراجعة الصفحات" }));
    fireEvent.click(screen.getByRole("button", { name: "اعتماد الصفحة" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "تم اعتماد الصفحة" })).toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "متابعة التصوير" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "التقاط صفحة" })).toBeEnabled());
    expect(document.querySelector("video")).toBe(video);
    expect(video.srcObject).toBe(stream);
    expect(stop).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "مراجعة الصفحات" })).toBeEnabled();
  });

  it("ignores an encoded capture after the camera is closed", async () => {
    let complete: BlobCallback | undefined;
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      complete = callback;
    });
    await openCamera();
    fireEvent.click(screen.getByRole("button", { name: "التقاط صفحة" }));
    fireEvent.click(screen.getAllByRole("button", { name: "إلغاء" })[0]);
    complete?.(new Blob(["image"], { type: "image/jpeg" }));
    fireEvent.click(screen.getByRole("button", { name: "التقاط بالكاميرا" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "التقاط صفحة" })).toBeEnabled());
    expect(screen.queryByRole("img", { name: "صفحة" })).toBeNull();
  });
});
