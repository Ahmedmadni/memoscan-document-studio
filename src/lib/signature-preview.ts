import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/** Browser-only import: Vite emits the matching PDF.js worker in production too. */
export async function renderSigningPage(bytes: Uint8Array, index: number, canvas: HTMLCanvasElement, signal: AbortSignal) {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  if (signal.aborted) return;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const loading = pdfjs.getDocument({ data: bytes.slice() });
  // Destroying the loading task also terminates its document, pages and worker.
  const abort = () => { void loading.destroy().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const doc = await loading.promise;
    if (signal.aborted) return;
    const page = await doc.getPage(index + 1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(760 / base.width, 920 / base.height, 1.5) });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("PREVIEW_FAILED");
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    page.cleanup();
  } finally {
    signal.removeEventListener("abort", abort);
    await loading.destroy();
  }
}
