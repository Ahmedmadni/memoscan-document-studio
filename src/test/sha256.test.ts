import { createHash, randomBytes } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { sha256, sha256Fallback } from "@/lib/sha256";
afterEach(() => vi.unstubAllGlobals());
it.each([0, 1, 3, 55, 56, 63, 64, 65, 127, 1024, 1000000])(
  "matches SHA-256 reference with %s bytes without Web Crypto",
  async (length) => {
    const input = randomBytes(length);
    vi.stubGlobal("crypto", undefined);
    expect(await sha256(input)).toBe(createHash("sha256").update(input).digest("hex"));
  },
);
it("handles a failing Web Crypto implementation and the standard abc vector", async () => {
  vi.stubGlobal("crypto", { subtle: { digest: () => Promise.reject(new Error("unavailable")) } });
  expect(await sha256(new TextEncoder().encode("abc"))).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  expect(sha256Fallback(new Uint8Array())).toHaveLength(32);
});
