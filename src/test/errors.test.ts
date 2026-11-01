import { describe, expect, it } from "vitest";
import { errorKey } from "@/lib/errors";

describe("errorKey", () => {
  it("shows a format-specific message for unsupported HEIC/HEIF files", () => {
    expect(errorKey(new Error("UNSUPPORTED_HEIC"))).toBe("errHeic");
  });

  it("keeps the existing image and storage error mappings", () => {
    expect(errorKey(new Error("UNSUPPORTED_IMAGE"))).toBe("errImage");
    expect(errorKey(new Error("NO_INDEXEDDB"))).toBe("errStorage");
  });

  it("falls back safely for unknown errors", () => {
    expect(errorKey(new Error("unexpected"))).toBe("errGeneric");
    expect(errorKey("unexpected")).toBe("errGeneric");
  });
});
