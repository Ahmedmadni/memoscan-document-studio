export type InkPoint = { x: number; y: number };
export type InkPath = { points: InkPoint[]; color: string; width: number };
export type Smoothing = 0 | 1 | 2;

/** Only inner samples move: endpoints and intentional dots stay where the pen landed. */
export function smoothInk(points: InkPoint[], strength: Smoothing): InkPoint[] {
  if (!strength || points.length < 3) return points;
  let result = points;
  for (let pass = 0; pass < strength; pass++) {
    result = result.map((point, i) =>
      i === 0 || i === result.length - 1
        ? point
        : {
            x: (result[i - 1].x + 2 * point.x + result[i + 1].x) / 4,
            y: (result[i - 1].y + 2 * point.y + result[i + 1].y) / 4,
          },
    );
  }
  return result;
}

export function drawInk(ctx: CanvasRenderingContext2D, paths: InkPath[], smoothing: Smoothing) {
  for (const path of paths) {
    const points = smoothInk(path.points, smoothing);
    if (!points.length) continue;
    ctx.strokeStyle = path.color;
    ctx.fillStyle = path.color;
    ctx.lineWidth = path.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (points.length === 1) {
      ctx.arc(points[0].x, points[0].y, path.width / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      ctx.quadraticCurveTo(
        current.x,
        current.y,
        (current.x + next.x) / 2,
        (current.y + next.y) / 2,
      );
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }
}

function segmentDistance(point: InkPoint, a: InkPoint, b: InkPoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t =
    dx * dx + dy * dy
      ? Math.max(
          0,
          Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)),
        )
      : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

/** Pick the topmost ink path, with a finger-friendly hit area in canvas pixels. */
export function hitInkPath(
  paths: InkPath[],
  point: InkPoint,
  tolerance: number,
  smoothing: Smoothing,
) {
  for (let i = paths.length - 1; i >= 0; i--) {
    const path = paths[i];
    const points = smoothInk(path.points, smoothing);
    for (let j = 0; j < points.length; j++) {
      if (
        segmentDistance(point, points[j], points[Math.min(j + 1, points.length - 1)]) <=
        tolerance + path.width / 2
      )
        return i;
    }
  }
  return -1;
}

export function inkBounds(paths: InkPath[], smoothing: Smoothing, width: number, height: number) {
  let left = width,
    top = height,
    right = 0,
    bottom = 0;
  for (const path of paths) {
    for (const point of smoothInk(path.points, smoothing)) {
      const radius = path.width / 2 + 12;
      left = Math.min(left, point.x - radius);
      top = Math.min(top, point.y - radius);
      right = Math.max(right, point.x + radius);
      bottom = Math.max(bottom, point.y + radius);
    }
  }
  return {
    x: Math.max(0, Math.floor(left)),
    y: Math.max(0, Math.floor(top)),
    width: Math.max(1, Math.min(width, Math.ceil(right)) - Math.max(0, Math.floor(left))),
    height: Math.max(1, Math.min(height, Math.ceil(bottom)) - Math.max(0, Math.floor(top))),
  };
}
