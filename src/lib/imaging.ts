// Client-side document image processing. Everything runs on <canvas> pixel data
// in the browser; no image ever leaves the device.

export type Pt = { x: number; y: number };
/** Normalized (0..1) corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Corners = [Pt, Pt, Pt, Pt];
export type FilterMode = "original" | "enhance" | "gray" | "bw" | "clean";
export type Rotation = 0 | 90 | 180 | 270;

export interface EditSettings {
  corners: Corners;
  rotation: Rotation;
  /** Fine deskew angle in degrees (-15..15). */
  angle: number;
  filter: FilterMode;
  brightness: number; // -100..100
  contrast: number; // -100..100
  sharpen: number; // 0..100
  threshold: number; // 0..30, adaptive threshold offset for B/W
}

export const FULL_CORNERS: Corners = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

export function defaultSettings(corners: Corners = FULL_CORNERS): EditSettings {
  return {
    corners: corners.map((p) => ({ ...p })) as Corners,
    rotation: 0,
    angle: 0,
    filter: "enhance",
    brightness: 0,
    contrast: 0,
    sharpen: 20,
    threshold: 10,
  };
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctx2d(c: HTMLCanvasElement) {
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D is not available");
  return ctx;
}

/** Decode an image blob (EXIF orientation applied) into a canvas capped at maxDim. */
export async function loadImageCanvas(blob: Blob, maxDim = 2400): Promise<HTMLCanvasElement> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    throw new Error("UNSUPPORTED_IMAGE");
  }
  const s = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const c = makeCanvas(bmp.width * s, bmp.height * s);
  ctx2d(c).drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

export function scaleCanvas(src: HTMLCanvasElement, maxDim: number): HTMLCanvasElement {
  const s = Math.min(1, maxDim / Math.max(src.width, src.height));
  if (s === 1) return src;
  const c = makeCanvas(src.width * s, src.height * s);
  const ctx = ctx2d(c);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// ---------- Perspective (homography) ----------

/** Solve the 3x3 homography H (h33 = 1) mapping each `from[i]` to `to[i]`. */
export function solveHomography(from: Pt[], to: Pt[]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: X, y: Y } = to[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X, X]);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y, Y]);
  }
  // Gaussian elimination with partial pivoting on the 8x9 augmented matrix.
  for (let col = 0; col < 8; col++) {
    let piv = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) throw new Error("DEGENERATE_CORNERS");
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let k = col; k < 9; k++) A[r][k] -= f * A[col][k];
    }
  }
  const h = A.map((row, i) => row[8] / row[i]);
  h.push(1);
  return h;
}

export function applyHomography(h: number[], p: Pt): Pt {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** True perspective rectification of the quad onto a rectangle (bilinear sampling). */
export function warpPerspective(src: HTMLCanvasElement, corners: Corners, maxOut = 2400) {
  const W = src.width;
  const H = src.height;
  const q = corners.map((p) => ({ x: p.x * W, y: p.y * H }));
  let outW = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
  let outH = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const s = Math.min(1, maxOut / Math.max(outW, outH));
  outW = Math.max(8, Math.round(outW * s));
  outH = Math.max(8, Math.round(outH * s));
  const rect: Pt[] = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ];
  const h = solveHomography(rect, q);
  const sd = ctx2d(src).getImageData(0, 0, W, H).data;
  const out = makeCanvas(outW, outH);
  const octx = ctx2d(out);
  const od = octx.createImageData(outW, outH);
  const o = od.data;
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const w = h[6] * u + h[7] * v + h[8];
      let x = (h[0] * u + h[1] * v + h[2]) / w;
      let y = (h[3] * u + h[4] * v + h[5]) / w;
      x = Math.min(W - 1.001, Math.max(0, x));
      y = Math.min(H - 1.001, Math.max(0, y));
      const x0 = x | 0;
      const y0 = y | 0;
      const fx = x - x0;
      const fy = y - y0;
      const i00 = (y0 * W + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + W * 4;
      const i11 = i01 + 4;
      const oi = (v * outW + u) * 4;
      for (let c = 0; c < 3; c++) {
        const top = sd[i00 + c] + (sd[i10 + c] - sd[i00 + c]) * fx;
        const bot = sd[i01 + c] + (sd[i11 + c] - sd[i01 + c]) * fx;
        o[oi + c] = top + (bot - top) * fy;
      }
      o[oi + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
  return out;
}

/**
 * Replace near-black border-connected artifacts left outside curved paper edges.
 * The conservative luminance threshold and border-only flood fill avoid erasing
 * ordinary dark text that is not connected to the output boundary.
 */
export function whitenBorderArtifacts(img: ImageData, threshold = 38) {
  const { width: w, height: h, data } = img;
  if (w < 3 || h < 3) return 0;
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const isArtifact = (p: number) => {
    const i = p * 4;
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    return Math.max(r, g, b) < threshold && Math.max(r, g, b) - Math.min(r, g, b) < 24;
  };
  const add = (p: number) => {
    if (!seen[p] && isArtifact(p)) {
      seen[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let x = 0; x < w; x++) {
    add(x);
    add((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    add(y * w);
    add(y * w + w - 1);
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) add(p - 1);
    if (x + 1 < w) add(p + 1);
    if (y > 0) add(p - w);
    if (y + 1 < h) add(p + w);
  }
  // Guard against a genuinely dark document or a nearly black scan.
  if (tail > w * h * 0.025) return 0;
  for (let i = 0; i < tail; i++) {
    const p = queue[i] * 4;
    data[p] = data[p + 1] = data[p + 2] = 255;
  }
  return tail;
}

/** Rotate by right angle + fine angle; uncovered areas are filled white. */
export function rotateCanvas(src: HTMLCanvasElement, degrees: number) {
  const d = ((degrees % 360) + 360) % 360;
  if (d === 0) return src;
  const r = (d * Math.PI) / 180;
  const cos = Math.abs(Math.cos(r));
  const sin = Math.abs(Math.sin(r));
  const out = makeCanvas(src.width * cos + src.height * sin, src.width * sin + src.height * cos);
  const ctx = ctx2d(out);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(r);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

// ---------- Pixel adjustments ----------

export function contrastFactor(c: number) {
  return (259 * (c + 255)) / (255 * (259 - c));
}

export function buildLut(brightness: number, contrast: number) {
  const f = contrastFactor(contrast * 1.28);
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = (i - 128) * f + 128 + brightness * 1.28;
  return lut;
}

function autoLevels(d: Uint8ClampedArray) {
  const n = d.length / 4;
  for (let c = 0; c < 3; c++) {
    const hist = new Uint32Array(256);
    for (let i = c; i < d.length; i += 4) hist[d[i]]++;
    let lo = 0;
    let hi = 255;
    let acc = 0;
    while (lo < 255 && (acc += hist[lo]) < n * 0.005) lo++;
    acc = 0;
    while (hi > 0 && (acc += hist[hi]) < n * 0.01) hi--;
    if (hi - lo < 10) continue;
    const scale = 255 / (hi - lo);
    for (let i = c; i < d.length; i += 4) d[i] = (d[i] - lo) * scale;
  }
  // mild saturation boost
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    for (let c = 0; c < 3; c++) d[i + c] = l + (d[i + c] - l) * 1.15;
  }
}

function toGray(d: Uint8ClampedArray) {
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = l;
  }
}

/**
 * Reduce soft shadows and uneven paper lighting using a local luminance estimate.
 * This is a lightweight on-device approximation; it preserves colour and avoids
 * relying on a server or a large computer-vision dependency.
 */
export function flattenPaperLighting(img: ImageData) {
  const { width: w, height: h, data } = img;
  const stride = w + 1;
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      row += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row;
    }
  }
  const radius = Math.max(8, Math.round(Math.max(w, h) / 28));
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w, x + radius + 1);
      const sum =
        integral[y1 * stride + x1] -
        integral[y0 * stride + x1] -
        integral[y1 * stride + x0] +
        integral[y0 * stride + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const gain = Math.min(1.42, Math.max(0.82, 238 / Math.max(70, mean)));
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = data[i + c] * gain;
        data[i + c] = Math.min(255, Math.max(0, v));
      }
    }
  }
}

function sharpen(img: ImageData, amount: number) {
  const { width: w, height: h, data: d } = img;
  const src = new Uint8ClampedArray(d);
  const a = amount / 100;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const lap =
          4 * src[i + c] -
          src[i - 4 + c] -
          src[i + 4 + c] -
          src[i - w * 4 + c] -
          src[i + w * 4 + c];
        d[i + c] = src[i + c] + lap * a;
      }
    }
  }
}

/** Adaptive (local mean) threshold via integral image — robust to uneven lighting. */
function adaptiveThreshold(img: ImageData, offset: number) {
  const { width: w, height: h, data: d } = img;
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += d[(y * w + x) * 4];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  const r = Math.max(7, Math.round(Math.max(w, h) / 40));
  const k = 1 - offset / 100;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const sum =
        integral[y1 * (w + 1) + x1] -
        integral[y0 * (w + 1) + x1] -
        integral[y1 * (w + 1) + x0] +
        integral[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const i = (y * w + x) * 4;
      const v = d[i] < mean * k ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  }
}

export function applyAdjustments(img: ImageData, s: EditSettings) {
  const d = img.data;
  if (s.filter === "clean") flattenPaperLighting(img);
  if (s.filter === "enhance") autoLevels(d);
  if (s.filter === "gray" || s.filter === "bw") toGray(d);
  if (s.brightness !== 0 || s.contrast !== 0) {
    const lut = buildLut(s.brightness, s.contrast);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = lut[d[i]];
      d[i + 1] = lut[d[i + 1]];
      d[i + 2] = lut[d[i + 2]];
    }
  }
  if (s.filter === "bw") adaptiveThreshold(img, s.threshold);
  else if (s.sharpen > 0) sharpen(img, s.sharpen);
}

/** Full pipeline: perspective warp → rotation/deskew → filters. */
export function processPage(
  src: HTMLCanvasElement,
  s: EditSettings,
  maxOut = 2400,
  opts: { skipAdjust?: boolean } = {},
) {
  const warped = warpPerspective(src, s.corners, maxOut);
  // Remove only small, dark regions connected to the rectified page boundary.
  const warpedContext = ctx2d(warped);
  const warpedPixels = warpedContext.getImageData(0, 0, warped.width, warped.height);
  whitenBorderArtifacts(warpedPixels);
  warpedContext.putImageData(warpedPixels, 0, 0);
  const rotated = rotateCanvas(warped, s.rotation + s.angle);
  const out = rotated === warped ? warped : rotated;
  if (opts.skipAdjust) return out;
  const ctx = ctx2d(out);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  applyAdjustments(img, s);
  ctx.putImageData(img, 0, 0);
  return out;
}

export function canvasToBlob(c: HTMLCanvasElement, type = "image/jpeg", quality = 0.9) {
  return new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("ENCODE_FAILED"))), type, quality),
  );
}

export function thumbnailDataUrl(c: HTMLCanvasElement, max = 320) {
  return scaleCanvas(c, max).toDataURL("image/jpeg", 0.75);
}

// ---------- Automatic edge detection (heuristic) ----------

/** Otsu's method: threshold maximizing between-class variance. */
export function otsu(hist: ArrayLike<number>, total: number) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let t = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      t = i;
    }
  }
  return t;
}

export type DetectMethod = "brightness" | "edges" | "none";
export interface DetectResult {
  corners: Corners;
  detected: boolean;
  method: DetectMethod;
}

/** Canvas wrapper: downscale, convert to gray, run the pure detector. */
export function detectDocument(src: HTMLCanvasElement): DetectResult {
  const small = scaleCanvas(src, 320);
  const w = small.width;
  const h = small.height;
  const d = ctx2d(small).getImageData(0, 0, w, h).data;
  const g = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++)
    g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return detectFromGray(g, w, h);
}

function boxBlur(g: Uint8Array, w: number, h: number, r: number) {
  const b = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && yy < h && xx >= 0 && xx < w) {
            s += g[yy * w + xx];
            n++;
          }
        }
      b[y * w + x] = s / n;
    }
  return b;
}

/**
 * Two strategies, both heuristic:
 * 1. brightness — Otsu threshold, largest bright region (light page on darker background).
 * 2. edges — Sobel edges, flood-fill the background from the image border, keep the
 *    enclosed region (helps with low contrast and uneven lighting).
 * Returns `detected: false` with full-image corners when neither is plausible.
 */
export function detectFromGray(g: Uint8Array, w: number, h: number): DetectResult {
  const b = boxBlur(g, w, h, 2);
  const hist = new Uint32Array(256);
  for (let i = 0; i < b.length; i++) hist[b[i]]++;
  const t = otsu(hist, b.length);
  const bright = new Uint8Array(w * h);
  for (let i = 0; i < b.length; i++) bright[i] = b[i] > t ? 1 : 0;
  const c1 = cornersFromMask(bright, w, h);
  if (c1) return { corners: c1, detected: true, method: "brightness" };

  // Edge strategy
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        b[i - w + 1] + 2 * b[i + 1] + b[i + w + 1] - b[i - w - 1] - 2 * b[i - 1] - b[i + w - 1];
      const gy =
        b[i + w - 1] + 2 * b[i + w] + b[i + w + 1] - b[i - w - 1] - 2 * b[i - w] - b[i - w + 1];
      mag[i] = Math.hypot(gx, gy);
    }
  const sorted = Float32Array.from(mag).sort();
  const thr = Math.max(12, sorted[Math.floor(sorted.length * 0.88)]);
  const edge = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mag[i] >= thr)
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) edge[i + dy * w + dx] = 1;
    }
  const bg = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (bg[p] || edge[p]) continue;
    bg[p] = 1;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  const inside = new Uint8Array(w * h);
  for (let i = 0; i < inside.length; i++) inside[i] = bg[i] ? 0 : 1;
  const c2 = cornersFromMask(inside, w, h);
  if (c2) return { corners: c2, detected: true, method: "edges" };
  return { corners: FULL_CORNERS, detected: false, method: "none" };
}

/** Largest 4-connected component → extreme-point quad, or null when implausible. */
export function cornersFromMask(mask: Uint8Array, w: number, h: number): Corners | null {
  const label = new Int32Array(w * h);
  let bestLabel = 0;
  let bestSize = 0;
  let cur = 0;
  const stack: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || label[i]) continue;
    cur++;
    let size = 0;
    stack.push(i);
    label[i] = cur;
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % w;
      const y = (p / w) | 0;
      const nb = [
        x > 0 ? p - 1 : -1,
        x < w - 1 ? p + 1 : -1,
        y > 0 ? p - w : -1,
        y < h - 1 ? p + w : -1,
      ];
      for (const q of nb)
        if (q >= 0 && mask[q] && !label[q]) {
          label[q] = cur;
          stack.push(q);
        }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = cur;
    }
  }
  const ratio = bestSize / (w * h);
  if (!bestLabel || ratio < 0.12 || ratio > 0.97) return null;
  let tl = { v: Infinity, x: 0, y: 0 };
  let br = { v: -Infinity, x: 0, y: 0 };
  let tr = { v: -Infinity, x: 0, y: 0 };
  let bl = { v: Infinity, x: 0, y: 0 };
  for (let i = 0; i < label.length; i++) {
    if (label[i] !== bestLabel) continue;
    const x = i % w;
    const y = (i / w) | 0;
    if (x + y < tl.v) tl = { v: x + y, x, y };
    if (x + y > br.v) br = { v: x + y, x, y };
    if (x - y > tr.v) tr = { v: x - y, x, y };
    if (x - y < bl.v) bl = { v: x - y, x, y };
  }
  const corners = [tl, tr, br, bl].map((p) => ({ x: p.x / (w - 1), y: p.y / (h - 1) })) as Corners;
  if (!isConvexQuad(corners) || quadArea(corners) < 0.1) return null;
  // Reject a "page" that is just the whole frame.
  if (quadArea(corners) > 0.96) return null;
  return corners;
}

export function quadArea(c: Corners) {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = c[i];
    const q = c[(i + 1) % 4];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function isConvexQuad(c: Corners) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = c[i];
    const b = c[(i + 1) % 4];
    const d = c[(i + 2) % 4];
    const cross = (b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}
