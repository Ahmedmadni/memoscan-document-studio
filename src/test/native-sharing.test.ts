import { beforeEach, describe, expect, it, vi } from "vitest";
import { canShareFile, shareFile } from "@/lib/pdf";
import { shareFileNative } from "@/lib/native";

const mocks = vi.hoisted(() => ({ native: false, share: vi.fn(), write: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => mocks.native } }));
vi.mock("@capacitor/share", () => ({ Share: { share: mocks.share } }));
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Filesystem: { writeFile: mocks.write },
}));
beforeEach(() => { mocks.native = false; mocks.share.mockReset(); mocks.write.mockReset(); });

describe("native PDF sharing", () => {
  it("offers native sharing even without browser file sharing", async () => {
    mocks.native = true;
    mocks.write.mockResolvedValue({ uri: "file:///cache/document.pdf" });
    mocks.share.mockResolvedValue({});
    const blob = { type: "application/pdf", arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer } as Blob;
    expect(canShareFile(blob, "document.pdf")).toBe(true);
    expect(await shareFile(blob, "document.pdf")).toBe("shared");
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ path: "document.pdf", directory: "CACHE" }));
    expect(mocks.share).toHaveBeenCalledWith(expect.objectContaining({ url: "file:///cache/document.pdf" }));
  });
  it("treats dismissing the native share sheet as cancellation", async () => {
    mocks.share.mockRejectedValue(new Error("Share canceled"));
    expect(await shareFileNative("file:///cache/document.pdf", "Document")).toBe("cancelled");
  });
  it("does not hide real native share errors", async () => {
    mocks.share.mockRejectedValue(new Error("Permission denied"));
    await expect(shareFileNative("file:///cache/document.pdf", "Document")).rejects.toThrow("Permission denied");
  });
});