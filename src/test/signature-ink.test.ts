import { describe, expect, it, vi } from "vitest";
import { drawInk, hitInkPath, inkBounds, smoothInk, type InkPath } from "@/lib/signature-ink";

const paths: InkPath[] = [
  {
    color: "#123456",
    width: 4,
    points: [
      { x: 10, y: 20 },
      { x: 40, y: 90 },
      { x: 70, y: 20 },
      { x: 100, y: 20 },
    ],
  },
  { color: "#000", width: 5, points: [{ x: 130, y: 100 }] },
];

describe("editable signature strokes", () => {
  it("suppresses inner zigzags without moving endpoints or Arabic-style dots", () => {
    const gentle = smoothInk(paths[0].points, 1);
    const strong = smoothInk(paths[0].points, 2);
    expect(gentle[0]).toEqual(paths[0].points[0]);
    expect(strong.at(-1)).toEqual(paths[0].points.at(-1));
    expect(gentle[1].y).toBeLessThan(90);
    expect(strong[1].y).toBeLessThan(gentle[1].y);
    expect(smoothInk(paths[1].points, 2)).toEqual(paths[1].points);
    expect(paths[0].points[1].y).toBe(90);
  });

  it("selects the topmost touched path, ignoring empty space", () => {
    expect(hitInkPath(paths, { x: 130, y: 100 }, 8, 1)).toBe(1);
    expect(hitInkPath(paths, { x: 10, y: 20 }, 8, 1)).toBe(0);
    expect(hitInkPath(paths, { x: 200, y: 200 }, 8, 1)).toBe(-1);
    expect(inkBounds(paths, 1, 300, 300)).toMatchObject({ x: 0, y: 6 });
  });

  it("draws every path with its own color and width, retaining the final tip", () => {
    const ctx = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    };
    drawInk(ctx as unknown as CanvasRenderingContext2D, paths, 1);
    expect(ctx.lineTo).toHaveBeenCalledWith(100, 20);
    expect(ctx.arc).toHaveBeenCalledWith(130, 100, 2.5, 0, Math.PI * 2);
    expect(ctx.stroke).toHaveBeenCalledOnce();
    expect(ctx.fill).toHaveBeenCalledOnce();
  });
});
