import { describe, expect, it } from "vitest";
import {
  applyHomography,
  flattenPaperLighting,
  isConvexQuad,
  otsu,
  solveHomography,
  FULL_CORNERS,
} from "@/lib/imaging";

describe("imaging", () => {
  it("homography maps the four source corners onto the target quad", () => {
    const from = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const to = [
      { x: 10, y: 5 },
      { x: 90, y: 12 },
      { x: 95, y: 98 },
      { x: 3, y: 90 },
    ];
    const h = solveHomography(from, to);
    from.forEach((p, i) => {
      const q = applyHomography(h, p);
      expect(q.x).toBeCloseTo(to[i].x, 6);
      expect(q.y).toBeCloseTo(to[i].y, 6);
    });
  });
  it("otsu splits a bimodal histogram between the peaks", () => {
    const hist = new Array(256).fill(0);
    hist[40] = 500;
    hist[200] = 500;
    const t = otsu(hist, 1000);
    expect(t).toBeGreaterThanOrEqual(40);
    expect(t).toBeLessThan(200);
  });
  it("reduces uneven illumination while preserving image alpha", () => {
    const data = new Uint8ClampedArray(20 * 10 * 4);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 20; x++) {
        const i = (y * 20 + x) * 4;
        const v = x < 10 ? 120 : 235;
        data.set([v, v, v, 255], i);
      }
    }
    const img = { width: 20, height: 10, data } as ImageData;
    const before = img.data[0];
    flattenPaperLighting(img);
    expect(img.data[0]).toBeGreaterThan(before);
    expect(img.data[3]).toBe(255);
  });
  it("rejects a self-intersecting quad", () => {
    expect(isConvexQuad(FULL_CORNERS)).toBe(true);
    expect(
      isConvexQuad([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ]),
    ).toBe(false);
  });
});
