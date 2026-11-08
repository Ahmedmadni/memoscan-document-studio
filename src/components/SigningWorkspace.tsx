import {
  BookmarkPlus,
  Calendar,
  Download,
  Eraser,
  FileSignature,
  ImagePlus,
  Pin,
  ShieldCheck,
  Stamp,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PageHeading } from "@/components/PageHeading";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { consumePendingSignPdf, downloadBlob, safeFilename, shareFile } from "@/lib/pdf";
import { isNative } from "@/lib/native";
import {
  clampPlacement,
  computePdfSha256,
  createDateStampImage,
  createOfficialStamp,
  createSignedPdf,
  displaySize,
  hasSignatureInk,
  INITIAL_PLACEMENT,
  listSavedSignatures,
  loadSigningPdf,
  readSignatureImage,
  removeSavedSignature,
  saveSignatureToVault,
  type PageGeometry,
  type PinnedOverlay,
  type SavedSignatureItem,
  type SignatureImage,
  type StampPreset,
} from "@/lib/signature";
import { toast } from "sonner";

const INK_COLORS = [
  { id: "blue", value: "#142b55", labelKey: "inkBlue" as const },
  { id: "black", value: "#111827", labelKey: "inkBlack" as const },
  { id: "red", value: "#b91c1c", labelKey: "inkRed" as const },
  { id: "green", value: "#15803d", labelKey: "inkGreen" as const },
];

export function SigningWorkspace() {
  const { t } = useI18n();
  const [pdf, setPdf] = useState<{ name: string; bytes: Uint8Array; pages: PageGeometry[] } | null>(
    null,
  );
  const [docHash, setDocHash] = useState("");
  const [includeAuditFooter, setIncludeAuditFooter] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [applyToAllPages, setApplyToAllPages] = useState(false);
  const [signature, setSignature] = useState<SignatureImage | null>(null);
  const [pinned, setPinned] = useState<PinnedOverlay[]>([]);
  const [mode, setMode] = useState<"draw" | "image" | "stamp">("draw");
  const [inkColor, setInkColor] = useState("#142b55");
  const [penWidth, setPenWidth] = useState(3.5);
  const [opacity, setOpacity] = useState(0.95);
  const [autoRemoveBg, setAutoRemoveBg] = useState(true);
  const [stampPreset, setStampPreset] = useState<StampPreset>("approved");
  const [stampHolder, setStampHolder] = useState("أحمد المدني");
  const [watermarkText, setWatermarkText] = useState("");
  const [vault, setVault] = useState<SavedSignatureItem[]>([]);
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
    setVault(listSavedSignatures());
    const pending = consumePendingSignPdf();
    if (pending) {
      void loadSigningPdf(pending.bytes)
        .then(async (pages) => {
          setPdf({ name: pending.name, bytes: pending.bytes, pages });
          setDocHash(await computePdfSha256(pending.bytes));
          setPageIndex(0);
          setPlacement(INITIAL_PLACEMENT);
          setPinned([]);
          setPreview("loading");
        })
        .catch(() => {});
    }
  }, []);

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
      const hash = await computePdfSha256(bytes);
      if (id !== revision.current.pdf) return;
      setPdf({ name: file.name, bytes, pages });
      setDocHash(hash);
      setPageIndex(0);
      setPlacement(INITIAL_PLACEMENT);
      setPinned([]);
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
      const image = await readSignatureImage(file, autoRemoveBg);
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
    ctx.lineWidth = penWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle =
      inkColor || getComputedStyle(canvas).getPropertyValue("--signature-ink").trim();
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
    if (!pdf || (!signature && !pinned.length) || preview !== "ready" || importing) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = await createSignedPdf(
        pdf.bytes,
        signature,
        pageIndex,
        safe,
        applyToAllPages,
        watermarkText,
        opacity,
        pinned,
        includeAuditFooter,
      );
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const name = safeFilename(pdf.name.replace(/\.pdf$/i, "") + "-signed");
      if (isNative()) {
        if ((await shareFile(blob, name)) === "cancelled") return;
      } else downloadBlob(blob, name);
      toast.success(t("signSuccess"));
    } catch {
      setError(t("signExportError"));
    } finally {
      setBusy(false);
    }
  }
  const disabled = busy || importing;
  const pageSize = page ? displaySize(page) : { width: 1, height: 1 };
  const pagePinned = pinned.filter((item) => item.pageIndex === pageIndex);

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <PageHeading title={t("signTitle")} />
        {error && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        )}
        <section className="mb-6 grid gap-6 border-b pb-6 md:grid-cols-2">
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
            {docHash && (
              <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-primary">
                <ShieldCheck className="size-3.5 shrink-0" />
                <span>
                  {t("docSha256Label")}: {docHash.slice(0, 16)}…
                </span>
              </p>
            )}
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
                  const canvas = canvasRef.current;
                  if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
                  setError(null);
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
              <Button
                disabled={disabled}
                variant={mode === "stamp" ? "default" : "outline"}
                onClick={() => {
                  setMode("stamp");
                  setError(null);
                  setSignature(createOfficialStamp(stampPreset, stampHolder, inkColor));
                }}
              >
                <Stamp className="me-2 size-4" />
                {t("signStamp")}
              </Button>
              <Button
                disabled={disabled}
                variant="outline"
                onClick={() => {
                  setError(null);
                  setSignature(createDateStampImage(inkColor));
                }}
              >
                <Calendar className="me-2 size-4" />
                {t("signDateStamp")}
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
              <label className="inline-flex items-center gap-2">
                <Switch
                  aria-label={t("autoRemoveBg")}
                  checked={autoRemoveBg}
                  onCheckedChange={setAutoRemoveBg}
                />
                <span>{t("autoRemoveBg")}</span>
              </label>
            </div>
          </div>
        </section>
        {importing && (
          <p role="status" className="mb-4 text-sm">
            {t("loading")}
          </p>
        )}
        {mode === "draw" && (
          <section className="mb-6 border-b pb-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">{t("signBox")}</h2>
              <div className="flex flex-wrap items-center gap-2">
                {INK_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-label={t(c.labelKey)}
                    title={t(c.labelKey)}
                    onClick={() => setInkColor(c.value)}
                    className={`size-6 rounded-full border-2 ${
                      inkColor === c.value ? "ring-2 ring-primary ring-offset-2" : "border-border"
                    }`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
                <label className="ms-2 flex items-center gap-2 text-xs text-muted-foreground">
                  {t("penWidth")}
                  <input
                    type="range"
                    min="1.5"
                    max="7"
                    step="0.5"
                    value={penWidth}
                    onChange={(e) => setPenWidth(Number(e.target.value))}
                    className="w-20 accent-primary"
                  />
                </label>
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
            </div>
            <canvas
              ref={canvasRef}
              aria-label={t("signBox")}
              width={900}
              height={220}
              className="h-44 w-full touch-none rounded-lg border bg-card"
              onPointerDown={disabled ? undefined : startDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerCancel={endDraw}
            />
          </section>
        )}
        {mode === "stamp" && (
          <section className="mb-6 grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("stampType")}
              </label>
              <select
                aria-label={t("stampType")}
                value={stampPreset}
                onChange={(e) => {
                  const p = e.target.value as StampPreset;
                  setStampPreset(p);
                  setSignature(createOfficialStamp(p, stampHolder, inkColor));
                }}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="approved">{t("stampApproved")}</option>
                <option value="certified">{t("stampCertified")}</option>
                <option value="confidential">{t("stampConfidential")}</option>
                <option value="reviewed">{t("stampReviewed")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("stampHolder")}
              </label>
              <input
                value={stampHolder}
                onChange={(e) => {
                  setStampHolder(e.target.value);
                  setSignature(createOfficialStamp(stampPreset, e.target.value, inkColor));
                }}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <div className="flex items-end gap-2">
              {INK_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-label={t(c.labelKey)}
                  onClick={() => {
                    setInkColor(c.value);
                    setSignature(createOfficialStamp(stampPreset, stampHolder, c.value));
                  }}
                  className={`size-8 rounded-full border-2 ${
                    inkColor === c.value ? "ring-2 ring-primary ring-offset-2" : "border-border"
                  }`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          </section>
        )}
        {signature && (
          <section className="mb-6 flex flex-wrap items-center gap-4 border-b pb-6">
            <span className="text-sm font-medium">{t("signPreview")}</span>
            <img
              src={signature.data}
              alt={t("signPreview")}
              className="h-16 max-w-56 object-contain"
            />
            <Button
              disabled={disabled}
              variant="outline"
              size="sm"
              onClick={() => {
                const updated = saveSignatureToVault(
                  mode === "stamp" ? stampHolder || "Stamp" : "Signature",
                  signature,
                );
                setVault(updated);
                toast.success(t("saved"));
              }}
            >
              <BookmarkPlus className="me-1 size-4" />
              {t("saveToVault")}
            </Button>
            {pdf && (
              <Button
                disabled={disabled}
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPinned((prev) => [
                    ...prev,
                    {
                      id: `${Date.now()}-${prev.length}`,
                      signature,
                      pageIndex,
                      placement: safe,
                      opacity,
                    },
                  ]);
                  setPlacement({
                    x: Math.min(0.7, safe.x + 0.06),
                    y: Math.min(0.8, safe.y + 0.06),
                    width: safe.width,
                  });
                  toast.success(t("saved"));
                }}
              >
                <Pin className="me-1 size-4" />
                {t("pinOverlay")}
              </Button>
            )}
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
        {pinned.length > 0 && (
          <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 text-xs">
            <span>
              {t("pinnedOverlays")}: <strong>{pinned.length}</strong>
            </span>
            <Button variant="ghost" size="sm" onClick={() => setPinned([])}>
              {t("clearPinned")}
            </Button>
          </section>
        )}
        {vault.length > 0 && (
          <section className="mb-6 border-b pb-6">
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
              {t("savedSignatures")}
            </h3>
            <div className="flex flex-wrap gap-3">
              {vault.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => setSignature(item.image)}
                    className="flex items-center gap-2"
                  >
                    <img
                      src={item.image.data}
                      alt={item.label}
                      className="h-9 w-20 object-contain"
                    />
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("delete")}
                    onClick={() => setVault(removeSavedSignature(item.id))}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}
        {pdf && (
          <section className="border-t pt-6">
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
            <fieldset className="mb-4 flex flex-wrap items-center gap-3 text-sm">
              <legend className="mb-2 font-medium">{t("signScope")}</legend>
              <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2">
                <input
                  type="radio"
                  name="signature-scope"
                  checked={!applyToAllPages}
                  onChange={() => setApplyToAllPages(false)}
                />
                {t("signCurrentPage")}
              </label>
              <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2">
                <input
                  type="radio"
                  name="signature-scope"
                  checked={applyToAllPages}
                  onChange={() => setApplyToAllPages(true)}
                />
                {t("signAllPages")}
              </label>
            </fieldset>
            <div className="mb-4 flex flex-wrap items-center gap-6">
              <div className="min-w-64 flex-1 max-w-md">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("watermarkLabel")}
                </label>
                <input
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  placeholder={t("watermarkPlaceholder")}
                  className="h-9 w-full rounded-md border bg-card px-3 text-sm"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-xs">
                <Switch
                  aria-label={t("includeAuditFooter")}
                  checked={includeAuditFooter}
                  onCheckedChange={setIncludeAuditFooter}
                />
                <span>{t("includeAuditFooter")}</span>
              </label>
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
              {preview === "ready" &&
                pagePinned.map((item) => (
                  <img
                    key={item.id}
                    src={item.signature.data}
                    alt=""
                    draggable={false}
                    className="pointer-events-none absolute border border-primary/40"
                    style={{
                      left: `${item.placement.x * 100}%`,
                      top: `${item.placement.y * 100}%`,
                      width: `${item.placement.width * 100}%`,
                      opacity: item.opacity ?? 1,
                      height: "auto",
                    }}
                  />
                ))}
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
                    opacity,
                    height: "auto",
                  }}
                />
              )}
            </div>
            <div className="mx-auto mt-4 grid max-w-xl gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3">
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
              <div className="flex items-center gap-3">
                <label htmlFor="signature-opacity" className="shrink-0 text-sm">
                  {t("signOpacity")}
                </label>
                <input
                  id="signature-opacity"
                  type="range"
                  disabled={disabled || !signature}
                  min="0.3"
                  max="1"
                  step="0.05"
                  value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                  className="min-w-0 flex-1"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button
                onClick={() => void exportPdf()}
                disabled={(!signature && !pinned.length) || disabled || preview !== "ready"}
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
