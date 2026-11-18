import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "fake-indexeddb/auto";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteCaptureDraft } from "@/lib/db";
import { ImagePickers } from "@/components/ImagePickers";
import { I18nProvider } from "@/lib/i18n";

vi.mock("@/lib/imaging", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imaging")>();
  return {
    ...actual,
    loadImageCanvas: vi.fn(async () => document.createElement("canvas")),
    processPage: vi.fn(() => document.createElement("canvas")),
  };
});
beforeEach(async () => {
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("File", NodeFile);
  await deleteCaptureDraft("scan");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function openCamera(onFiles = vi.fn()) {
  const stop = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })) },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/jpeg;base64,dGVzdA==",
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:camera");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  render(
    <I18nProvider>
      <ImagePickers onFiles={onFiles} />
    </I18nProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "التقاط بالكاميرا" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "التقاط بالكاميرا" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "التقاط صفحة" })).toBeEnabled());
  const video = document.querySelector("video");
  if (!video) throw new Error("Missing camera video");
  Object.defineProperty(video, "videoWidth", { value: 640 });
  Object.defineProperty(video, "videoHeight", { value: 480 });
  return { video, stop, onFiles };
}

describe("camera review lifecycle", () => {
  it("restores the capture and its approval after the workspace remounts", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
      callback(new Blob(["image"], { type: "image/jpeg" })),
    );
    await openCamera();
    fireEvent.click(screen.getByRole("button", { name: "التقاط صفحة" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "مراجعة الصفحات" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "مراجعة الصفحات" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "اعتماد الصفحة" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "اعتماد الصفحة" }));
    await waitFor(() =>
      expect(
        screen.getByText("الجلسة محفوظة؛ يمكنك إغلاق الكاميرا واستكمالها لاحقا"),
      ).toBeInTheDocument(),
    );
    cleanup();
    await openCamera();
    fireEvent.click(screen.getByRole("button", { name: "مراجعة الصفحات" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "تم اعتماد الصفحة" })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "إضافة الصفحات المعتمدة (1/1)" })).toBeEnabled();
  });
  it("retains a rejected import in the draft for retry", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
      callback(new Blob(["image"], { type: "image/jpeg" })),
    );
    const onFiles = vi.fn(async (files: File[]) => files);
    await openCamera(onFiles);
    fireEvent.click(screen.getByRole("button", { name: "التقاط صفحة" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "مراجعة الصفحات" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "مراجعة الصفحات" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "اعتماد الصفحة" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "اعتماد الصفحة" }));
    fireEvent.click(screen.getByRole("button", { name: "إضافة الصفحات المعتمدة (1/1)" }));
    await waitFor(() =>
      expect(
        screen.getByText("بعض الصفحات لم تضف. بقيت في المسودة لتعيد المحاولة."),
      ).toBeInTheDocument(),
    );
    expect(onFiles).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "إضافة الصفحات المعتمدة (1/1)" })).toBeEnabled();
  });
  it("captures two pages without review interruption and imports only after both approvals", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
      callback(new Blob(["image"], { type: "image/jpeg" })),
    );
    const { video, onFiles, stop } = await openCamera();
    fireEvent.click(screen.getByRole("button", { name: "التقاط صفحة" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "التقاط صفحة" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "التقاط صفحة" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "التقاط صفحة" })).toBeEnabled());
    expect(document.querySelector("video")).toBe(video);
    expect(screen.queryByRole("button", { name: "اعتماد الصفحة" })).toBeNull();
    expect(onFiles).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "مراجعة الصفحات" }));
    expect(screen.getByRole("button", { name: "إضافة الصفحات المعتمدة (0/2)" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "صفحة 2" }));
    expect(screen.getByRole("button", { name: "صفحة 2" })).toHaveAttribute("aria-pressed", "true");
    expect(video).not.toBeVisible();
    const approve = screen.getByRole("button", { name: "اعتماد الصفحة" });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "إضافة الصفحات المعتمدة (1/2)" })).toBeDisabled(),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "اعتماد الصفحة" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "اعتماد الصفحة" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "إضافة الصفحات المعتمدة (2/2)" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "إضافة الصفحات المعتمدة (2/2)" }));
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    expect(onFiles.mock.calls[0][0]).toHaveLength(2);
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });
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
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "اعتماد الصفحة" })).toBeEnabled(),
    );
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

  it("edits a captured page before approval and keeps that edit when approving the batch", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
      callback(new Blob(["image"], { type: "image/jpeg" })),
    );
    const { onFiles } = await openCamera();
    fireEvent.click(screen.getByRole("button", { name: "التقاط صفحة" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "مراجعة الصفحات" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "مراجعة الصفحات" }));
    fireEvent.click(screen.getByRole("button", { name: "تحرير" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "حفظ" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "التحسين" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "تبييض الورقة" }));
    fireEvent.click(screen.getByRole("switch", { name: "تسوية حواف الورق المموج" }));
    fireEvent.click(screen.getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "حفظ" })).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "اعتماد الصفحة" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "اعتماد الصفحة" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "إضافة الصفحات المعتمدة (1/1)" })).toBeEnabled(),
    );
    const { processPage } = await import("@/lib/imaging");
    expect(processPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filter: "paper",
        curvedEdges: true,
      }),
      1000,
    );
    fireEvent.click(screen.getByRole("button", { name: "إضافة الصفحات المعتمدة (1/1)" }));
    await waitFor(() => expect(onFiles).toHaveBeenCalledOnce());
    const [[files, edits]] = onFiles.mock.calls;
    expect(files).toHaveLength(1);
    expect(edits.get(files[0])).toMatchObject({ filter: "paper", curvedEdges: true });
  });
});
