import { describe, expect, it } from "vitest";
import {
  applyAdjustments,
  defaultSettings,
  straightenCurvedPaper,
  whitenPaper,
} from "@/lib/imaging";

function image(w: number, h: number, pixel: (x: number, y: number) => number[]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(pixel(x, y), (y * w + x) * 4);
  return { width: w, height: h, data } as ImageData;
}

describe("local paper cleanup", () => {
  it("whitens shaded yellow paper while preserving faint writing, dark ink, colour and alpha", () => {
    const img = image(128, 96, (x, y) => {
      const shade = 0.6 + x / 320;
      if (y === 40 && x > 20 && x < 100) return [30, 30, 30, 210];
      if (y === 50 && x > 20 && x < 100) return [180 * shade, 175 * shade, 155 * shade, 210];
      if (y === 60 && x > 20 && x < 100) return [20, 45, 110, 210];
      return [240 * shade, 230 * shade, 200 * shade, 210];
    });
    whitenPaper(img);
    expect(img.data[(20 * 128 + 20) * 4]).toBeGreaterThanOrEqual(245);
    expect(img.data[(40 * 128 + 40) * 4]).toBeLessThan(65);
    expect(img.data[(50 * 128 + 40) * 4]).toBeLessThan(210);
    const blue = (60 * 128 + 40) * 4;
    expect(img.data[blue + 2]).toBeGreaterThan(img.data[blue] + 60);
    expect(img.data[blue + 3]).toBe(210);
  });
  it("rectifies mild curved side contours and removes grey surroundings without losing central writing", () => {
    const img = image(200, 160, (x, y) => {
      const edge = 8 + Math.round(5 * Math.sin(y / 25));
      if (x < edge || x >= 200 - edge) return [90, 70, 65, 255];
      if (y >= 75 && y <= 78 && x > 60 && x < 140) return [20, 20, 20, 255];
      return [235, 232, 224, 255];
    });
    expect(straightenCurvedPaper(img)).toBe(true);
    for (let y = 0; y < 160; y++) {
      expect(img.data[y * 200 * 4]).toBeGreaterThan(220);
      expect(img.data[(y * 200 + 199) * 4]).toBeGreaterThan(220);
    }
    expect(img.data[(76 * 200 + 100) * 4]).toBeLessThan(30);
  });
  it("leaves dark documents and isolated edge-touching writing unchanged", () => {
    const dark = image(100, 100, () => [65, 65, 65, 255]);
    const before = dark.data.slice();
    expect(straightenCurvedPaper(dark)).toBe(false);
    expect(dark.data).toEqual(before);
    const text = image(100, 100, (x, y) =>
      y === 50 && x < 12 ? [10, 10, 10, 255] : [240, 240, 240, 255],
    );
    const original = text.data.slice();
    expect(straightenCurvedPaper(text)).toBe(false);
    expect(text.data).toEqual(original);
  });
  it("clear-text filter produces white paper and black writing at original dimensions", () => {
    const img = image(120, 100, (x, y) => {
      const shade = 150 + x / 2;
      const v = y === 50 && x > 25 && x < 95 ? shade * 0.55 : shade;
      return [v, v, v, 255];
    });
    applyAdjustments(img, { ...defaultSettings(), filter: "text" });
    expect(img.data[(50 * 120 + 60) * 4]).toBe(0);
    expect(img.data[(20 * 120 + 60) * 4]).toBe(255);
    expect(img.width).toBe(120);
    expect(img.height).toBe(100);
  });
});
