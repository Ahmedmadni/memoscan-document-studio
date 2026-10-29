import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Eraser, FileSignature, ImagePlus, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { downloadBlob } from "@/lib/pdf";
import {
  clampPlacement,
  createSignedPdf,
  displaySize,
  hasSignatureInk,
  INITIAL_PLACEMENT,
  loadSigningPdf,
  readSignatureImage,
  type PageGeometry,
  type SignatureImage,
} from "@/lib/signature";
import { toast } from "sonner";

export const Route = createFileRoute("/sign")({
  head: () => ({
    meta: [
      { title: "Waraqah — Add signature" },
      {
        name: "description",
        content: "Add a visual signature to a selected PDF page privately on your device.",
      },
      { property: "og:title", content: "Waraqah — Add signature" },
      {
        property: "og:description",
        content: "Draw or import a signature and export a separate signed PDF on-device.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SignPage,
});

export function SignPage() {
  const { t } = useI18n();
  const [pdf, setPdf] = useState<{ name: string; bytes: Uint8Array; pages: PageGeometry[] } | null>(
    null,
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [signature, setSignature] = useState<SignatureImage | null>(null);
  const [mode, setMode] = useState<"draw" | "image">("draw");
  const [placement, setPlacement] = useState(INITIAL_PLACEMENT);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const revision = useRef({ pdf: 0, image: 0 });
  const page = pdf?.pages[pageIndex];
  const safe = page && signature ? clampPlacement(placement, signature.aspect, page) : placement;

  useEffect(() => {
    if (!pdf || !previewRef.current) return;
    const controller = new AbortController();
    const canvas = previewRef.current;
    setPreview("loading");
    void import("@/lib/signature-preview")
      .then(({ renderSigningPage }) =>
        renderSigningPage(pdf.bytes, pageIndex, canvas, controller.signal),
      )
      .then(() => {
        if (!controller.signal.aborted) setPreview("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setPreview("error");
      });
    return () => controller.abort();
  }, [pdf, pageIndex]);

  async function choosePdf(file?: File) {
    if (!file) return;
    const id = ++revision.current.pdf;
    setImporting(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pages = await loadSigningPdf(bytes);
      if (id !== revision.current.pdf) return;
      setPdf({ name: file.name, bytes, pages });
      setPageIndex(0);
      setPlacement(INITIAL_PLACEMENT);
      setPreview("loading");
    } catch {
      if (id === revision.current.pdf) setError(t("signBadPdf"));
    } finally {
      if (id === revision.current.pdf) setImporting(false);
    }
  }

  async function chooseImage(file?: File) {
    if (!file) return;
    const id = ++revision.current.image;
    setImporting(true);
    setError(null);
    try {
      const image = await readSignatureImage(file);
      if (id !== revision.current.image) return;
      setSignature(image);
      setMode("image");
    } catch (e) {
      if (id === revision.current.image)
        setError(
          t(e instanceof Error && e.message === "BLANK_SIGNATURE" ? "signBlank" : "signBadImage"),
        );
    } finally {
      if (id === revision.current.image) setImporting(false);
    }
  }

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    drawing.current = true;
    const r = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(
      ((e.clientX - r.left) * canvas.width) / r.width,
      ((e.clientY - r.top) * canvas.height) / r.height,
    );
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--signature-ink").trim();
    setError(null);
  }
  function moveDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!drawing.current || !canvas || !ctx) return;
    const r = canvas.getBoundingClientRect();
    ctx.lineTo(
      ((e.clientX - r.left) * canvas.width) / r.width,
      ((e.clientY - r.top) * canvas.height) / r.height,
    );
    ctx.stroke();
  }
  function endDraw() {
    if (!drawing.current) return;
    drawing.current = false;
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    if (!hasSignatureInk(ctx.getImageData(0, 0, c.width, c.height).data)) {
      setSignature(null);
      setError(t("signBlank"));
      return;
    }
    setSignature({ data: c.toDataURL("image/png"), aspect: c.height / c.width });
  }
  async function exportPdf() {
    if (!pdf || !signature || preview !== "ready" || importing) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = await createSignedPdf(pdf.bytes, signature, pageIndex, safe);
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const name = pdf.name.replace(/\.pdf$/i, "") + "-signed.pdf";
      const { isNative, savePdfNative, shareFileNative } = await import("@/lib/native");
      if (isNative()) await shareFileNative(await savePdfNative(blob, name), name);
      else downloadBlob(blob, name);
      toast.success(t("signSuccess"));
    } catch {
      setError(t("signExportError"));
    } finally {
      setBusy(false);
    }
  }
  const disabled = busy || importing;
  const pageSize = page ? displaySize(page) : { width: 1, height: 1 };
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-6 flex items-center gap-3 pt-6">
          <Button variant="ghost" size="icon" aria-label={t("back")} asChild>
            <Link to="/">
              <ArrowLeft className="rtl:rotate-180" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{t("signTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("signIntro")}</p>
          </div>
        </div>
        {error && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        )}
        <section className="mb-6 grid gap-4 rounded-2xl border bg-card p-4 md:grid-cols-2">
          <div className="min-w-0">
            <h2 className="mb-2 font-semibold">{t("signPdf")}</h2>
            <input
              ref={fileInput}
              aria-label={t("choosePdf")}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                void choosePdf(f);
              }}
            />
            <Button
              className="h-auto max-w-full whitespace-normal break-all"
              disabled={disabled}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="me-2 size-4 shrink-0" />
              {pdf?.name || t("choosePdf")}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">{t("signOriginal")}</p>
          </div>
          <div>
            <h2 className="mb-2 font-semibold">{t("signSource")}</h2>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={disabled}
                variant={mode === "draw" ? "default" : "outline"}
                onClick={() => {
                  setMode("draw");
                  setSignature(null);
                }}
              >
                <FileSignature className="me-2 size-4" />
                {t("signDraw")}
              </Button>
              <input
                ref={imageInput}
                aria-label={t("signImport")}
                type="file"
                accept="image/png,image/jpeg"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  void chooseImage(f);
                }}
              />
              <Button
                disabled={disabled}
                variant="outline"
                onClick={() => imageInput.current?.click()}
              >
                <ImagePlus className="me-2 size-4" />
                {t("signImport")}
              </Button>
            </div>
          </div>
        </section>
        {importing && (
          <p role="status" className="mb-4 text-sm">
            {t("loading")}
          </p>
        )}
        {mode === "draw" && (
          <section className="mb-6 rounded-2xl border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">{t("signBox")}</h2>
              <Button
                disabled={disabled}
                size="sm"
                variant="ghost"
                onClick={() => {
                  const c = canvasRef.current;
                  if (c) c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
                  setSignature(null);
                  setError(null);
                }}
              >
                <Eraser className="me-2 size-4" />
                {t("clear")}
              </Button>
            </div>
            <canvas
              ref={canvasRef}
              aria-label={t("signBox")}
              width={900}
              height={220}
              className="h-44 w-full touch-none rounded-xl border bg-card"
              onPointerDown={disabled ? undefined : startDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerCancel={endDraw}
            />
          </section>
        )}
        {signature && (
          <section className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4">
            <span className="text-sm font-medium">{t("signPreview")}</span>
            <img
              src={signature.data}
              alt={t("signPreview")}
              className="h-16 max-w-56 object-contain"
            />
            <Button
              disabled={disabled}
              variant="ghost"
              size="sm"
              onClick={() => setSignature(null)}
            >
              {t("remove")}
            </Button>
          </section>
        )}
        {pdf && (
          <section className="rounded-2xl border bg-card p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">{t("signPlace")}</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled || pageIndex === 0}
                  onClick={() => {
                    setPageIndex((p) => p - 1);
                    setPreview("loading");
                  }}
                >
                  {t("previous")}
                </Button>
                <span className="text-sm">
                  {pageIndex + 1} / {pdf.pages.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled || pageIndex + 1 >= pdf.pages.length}
                  onClick={() => {
                    setPageIndex((p) => p + 1);
                    setPreview("loading");
                  }}
                >
                  {t("next")}
                </Button>
              </div>
            </div>
            {preview === "loading" && (
              <p role="status" className="mb-3 text-sm">
                {t("signPreviewLoading")}
              </p>
            )}
            {preview === "error" && (
              <p role="alert" className="text-destructive">
                {t("signPreviewError")}
              </p>
            )}
            <div
              className="relative mx-auto w-fit max-w-full overflow-hidden rounded border bg-muted"
              style={{ aspectRatio: `${pageSize.width} / ${pageSize.height}` }}
            >
              <canvas
                ref={previewRef}
                aria-label={t("signPdf")}
                className={`block h-auto max-w-full ${preview !== "ready" ? "invisible" : ""}`}
              />
              {signature && preview === "ready" && (
                <img
                  src={signature.data}
                  alt={t("signPlace")}
                  draggable={false}
                  onPointerDown={(e) => {
                    if (disabled) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    drag.current = { x: e.clientX, y: e.clientY, startX: safe.x, startY: safe.y };
                  }}
                  onPointerMove={(e) => {
                    const d = drag.current;
                    const parent = e.currentTarget.parentElement;
                    if (!d || !parent || !page || !e.currentTarget.hasPointerCapture(e.pointerId))
                      return;
                    const r = parent.getBoundingClientRect();
                    setPlacement(
                      clampPlacement(
                        {
                          ...safe,
                          x: d.startX + (e.clientX - d.x) / r.width,
                          y: d.startY + (e.clientY - d.y) / r.height,
                        },
                        signature.aspect,
                        page,
                      ),
                    );
                  }}
                  onPointerUp={() => {
                    drag.current = null;
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                  }}
                  onLostPointerCapture={() => {
                    drag.current = null;
                  }}
                  className="absolute cursor-move touch-none border border-dashed border-muted-foreground"
                  style={{
                    left: `${safe.x * 100}%`,
                    top: `${safe.y * 100}%`,
                    width: `${safe.width * 100}%`,
                    height: "auto",
                  }}
                />
              )}
            </div>
            <div className="mx-auto mt-4 flex max-w-xl items-center gap-3">
              <label htmlFor="signature-size" className="shrink-0 text-sm">
                {t("signSize")}
              </label>
              <input
                id="signature-size"
                type="range"
                disabled={disabled || !signature}
                min="0.001"
                max="0.5"
                step="0.001"
                value={safe.width}
                onChange={(e) => {
                  if (page && signature)
                    setPlacement(
                      clampPlacement(
                        { ...safe, width: Number(e.target.value) },
                        signature.aspect,
                        page,
                      ),
                    );
                }}
                className="min-w-0 flex-1"
              />
            </div>
            <div className="mt-5 flex justify-end">
              <Button
                onClick={() => void exportPdf()}
                disabled={!signature || disabled || preview !== "ready"}
              >
                {busy ? (
                  t("exporting")
                ) : (
                  <>
                    <Download className="me-2 size-4" />
                    {t("signExport")}
                  </>
                )}
              </Button>
            </div>
          </section>
        )}
        <p className="mt-5 text-xs text-muted-foreground">{t("signDisclaimer")}</p>
      </main>
    </div>
  );
}
