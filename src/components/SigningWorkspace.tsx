import {
  BookmarkPlus,
  Calendar,
  CheckCircle2,
  Download,
  Eraser,
  FileSignature,
  ImagePlus,
  Pin,
  Maximize2,
  Minimize2,
  Redo2,
  ShieldCheck,
  Stamp,
  Trash2,
  Undo2,
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
import {
  drawInk,
  hitInkPath,
  inkBounds,
  type InkPath,
  type InkPoint,
  type Smoothing,
} from "@/lib/signature-ink";
import { toast } from "sonner";

const INK_COLORS = [
  { id: "blue", value: "#142b55", labelKey: "inkBlue" as const },
  { id: "black", value: "#111827", labelKey: "inkBlack" as const },
  { id: "red", value: "#b91c1c", labelKey: "inkRed" as const },
  { id: "green", value: "#15803d", labelKey: "inkGreen" as const },
];

type InkStroke = {
  canvas: HTMLCanvasElement;
  pointerId: number;
  path: InkPath;
  minDistance: number;
};

function inkPoint(event: PointerEvent, canvas: HTMLCanvasElement, bounds: DOMRect): InkPoint {
  return {
    x: Math.max(
      0,
      Math.min(canvas.width, ((event.clientX - bounds.left) * canvas.width) / bounds.width),
    ),
    y: Math.max(
      0,
      Math.min(canvas.height, ((event.clientY - bounds.top) * canvas.height) / bounds.height),
    ),
  };
}

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
  const [smoothing, setSmoothing] = useState<Smoothing>(1);
  const [inkTool, setInkTool] = useState<"pen" | "eraser">("pen");
  const [expandedInk, setExpandedInk] = useState(false);
  const [paths, setPaths] = useState<InkPath[]>([]);
  const [past, setPast] = useState<InkPath[][]>([]);
  const [future, setFuture] = useState<InkPath[][]>([]);
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
  const drawing = useRef<InkStroke | null>(null);
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const revision = useRef({ pdf: 0, image: 0 });
  const page = pdf?.pages[pageIndex];
  const safe = page && signature ? clampPlacement(placement, signature.aspect, page) : placement;

  function paint(pathsToDraw: InkPath[], strength = smoothing) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawInk(ctx, pathsToDraw, strength);
  }

  function updateInk(next: InkPath[], strength = smoothing) {
    setPaths(next);
    paint(next, strength);
    const canvas = canvasRef.current;
    if (!canvas || !next.length) {
      setSignature(null);
      return;
    }
    const crop = inkBounds(next, strength, canvas.width, canvas.height);
    const source = canvas.getContext("2d");
    const trimmed = document.createElement("canvas");
    trimmed.width = crop.width;
    trimmed.height = crop.height;
    const target = trimmed.getContext("2d");
    if (!source || !target) return;
    target.putImageData(source.getImageData(crop.x, crop.y, crop.width, crop.height), 0, 0);
    setSignature({ data: trimmed.toDataURL("image/png"), aspect: trimmed.height / trimmed.width });
    setError(null);
  }

  function commitInk(next: InkPath[]) {
    setPast([...past, paths].slice(-50));
    setFuture([]);
    updateInk(next);
  }

  function undoInk() {
    if (!past.length) return;
    setFuture([paths, ...future]);
    setPast(past.slice(0, -1));
    updateInk(past[past.length - 1]);
  }

  function redoInk() {
    if (!future.length) return;
    setPast([...past, paths].slice(-50));
    setFuture(future.slice(1));
    updateInk(future[0]);
  }

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

  function clearDrawing() {
    drawing.current = null;
    if (paths.length) commitInk([]);
    else {
      setSignature(null);
      setError(null);
    }
  }

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = e.currentTarget;
    if (e.button !== 0 || drawing.current?.canvas === canvas) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    const point = inkPoint(e.nativeEvent, canvas, bounds);
    const scale = canvas.width / bounds.width;
    if (inkTool === "eraser") {
      const index = hitInkPath(paths, point, 12 * scale, smoothing);
      if (index >= 0) commitInk(paths.filter((_, i) => i !== index));
      return;
    }
    drawing.current = {
      canvas,
      pointerId: e.pointerId,
      path: { points: [point], color: inkColor, width: penWidth * scale },
      minDistance: 0.5 * scale,
    };
    canvas.setPointerCapture?.(e.pointerId);
    setError(null);
  }

  function moveDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = drawing.current;
    const canvas = e.currentTarget;
    if (!stroke || stroke.pointerId !== e.pointerId || stroke.canvas !== canvas) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    const event = e.nativeEvent;
    const coalesced = event.getCoalescedEvents?.();
    const samples = coalesced?.length ? coalesced : [event];
    const points = stroke.path.points;
    const before = points.length;
    for (const sample of samples) {
      const point = inkPoint(sample, canvas, bounds);
      const last = points[points.length - 1];
      if (
        points.length < 2048 &&
        Math.hypot(point.x - last.x, point.y - last.y) >= stroke.minDistance
      )
        points.push(point);
    }
    if (points.length !== before) paint([...paths, stroke.path]);
  }

  function endDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = drawing.current;
    const canvas = e.currentTarget;
    if (!stroke || stroke.pointerId !== e.pointerId || stroke.canvas !== canvas) return;
    if (e.type === "pointerup") moveDraw(e);
    drawing.current = null;
    if (e.type !== "pointerup") {
      paint(paths);
      return;
    }
    commitInk([...paths, stroke.path]);
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
      <main className="mx-auto max-w-6xl px-4 pb-20">
        <PageHeading title={t("signTitle")} />

        <ol className="mb-6 grid grid-cols-3 gap-2 rounded-2xl border bg-card p-3 text-xs shadow-paper">
          {[
            { label: t("signPdf"), done: !!pdf },
            { label: t("signSource"), done: !!signature || pinned.length > 0 },
            {
              label: t("signPlace"),
              done: preview === "ready" && (!!signature || pinned.length > 0),
            },
          ].map(({ label, done }, index, steps) => (
            <li
              key={label}
              aria-current={steps.findIndex((step) => !step.done) === index ? "step" : undefined}
              className={`flex items-start gap-1.5 font-semibold ${done ? "text-primary" : "text-muted-foreground"}`}
            >
              {done ? <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" /> : null}
              <span>{label}</span>
            </li>
          ))}
        </ol>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        {/* Step 1 & Step 2 Cards */}
        <section className="mb-6 grid gap-4 md:grid-cols-2">
          <div className="min-w-0 rounded-2xl border bg-card p-4 shadow-paper">
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
              <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] text-primary">
                <ShieldCheck className="size-3.5 shrink-0" />
                <span>
                  {t("docSha256Label")}: {docHash.slice(0, 16)}…
                </span>
              </p>
            )}
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-paper">
            <h2 className="mb-2 font-semibold">{t("signSource")}</h2>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={disabled}
                variant={mode === "draw" ? "default" : "outline"}
                onClick={() => {
                  setMode("draw");
                  if (mode !== "draw") updateInk(paths);
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
                  setMode("stamp");
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

        <section
          className={
            mode !== "draw"
              ? "hidden"
              : expandedInk
                ? "fixed inset-0 z-50 overflow-auto bg-background p-4 sm:p-8"
                : "mb-6 rounded-2xl border bg-card p-4 shadow-paper"
          }
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">{t("signBox")}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {INK_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-label={t(c.labelKey)}
                  title={t(c.labelKey)}
                  disabled={disabled}
                  onClick={() => {
                    setInkTool("pen");
                    setInkColor(c.value);
                  }}
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
                  disabled={disabled}
                  min="1.5"
                  max="7"
                  step="0.5"
                  value={penWidth}
                  onChange={(e) => setPenWidth(Number(e.target.value))}
                  className="w-20 accent-primary"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                {t("signSmoothing")}
                <select
                  aria-label={t("signSmoothing")}
                  disabled={disabled}
                  value={smoothing}
                  onChange={(e) => {
                    const strength = Number(e.target.value) as Smoothing;
                    setSmoothing(strength);
                    updateInk(paths, strength);
                  }}
                  className="h-9 rounded-md border bg-background px-2"
                >
                  <option value={0}>{t("signSmoothingOff")}</option>
                  <option value={1}>{t("signSmoothingGentle")}</option>
                  <option value={2}>{t("signSmoothingStrong")}</option>
                </select>
              </label>
              <Button
                disabled={disabled}
                aria-pressed={inkTool === "eraser"}
                size="sm"
                variant={inkTool === "eraser" ? "secondary" : "ghost"}
                onClick={() => setInkTool(inkTool === "pen" ? "eraser" : "pen")}
              >
                <Eraser className="me-2 size-4" />
                {t("signStrokeEraser")}
              </Button>
              <Button
                disabled={disabled || !past.length}
                aria-label={t("undo")}
                size="icon"
                variant="ghost"
                onClick={undoInk}
              >
                <Undo2 className="size-4" />
              </Button>
              <Button
                disabled={disabled || !future.length}
                aria-label={t("redo")}
                size="icon"
                variant="ghost"
                onClick={redoInk}
              >
                <Redo2 className="size-4" />
              </Button>
              <Button disabled={disabled} size="sm" variant="ghost" onClick={clearDrawing}>
                <Trash2 className="me-2 size-4" />
                {t("clear")}
              </Button>
              <Button
                disabled={disabled}
                size="sm"
                variant="outline"
                onClick={() => setExpandedInk((open) => !open)}
              >
                {expandedInk ? (
                  <Minimize2 className="me-2 size-4" />
                ) : (
                  <Maximize2 className="me-2 size-4" />
                )}
                {expandedInk ? t("signCloseExpanded") : t("signExpandCanvas")}
              </Button>
            </div>
          </div>
          <div className="mx-auto max-w-5xl overflow-x-auto rounded-xl bg-muted p-2">
            <canvas
              ref={canvasRef}
              aria-label={t("signBox")}
              width={1440}
              height={900}
              className={`mx-auto block h-auto w-full touch-none rounded-xl bg-white ring-1 ring-inset ring-border ${expandedInk ? "min-w-[560px] sm:min-w-0" : ""}`}
              onPointerDown={disabled ? undefined : startDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerCancel={endDraw}
              onLostPointerCapture={endDraw}
            />
          </div>
          {expandedInk && (
            <p className="mx-auto mt-2 max-w-5xl text-xs text-muted-foreground">
              {t("signExpandedHint")}
            </p>
          )}
        </section>

        {mode === "stamp" && (
          <section className="mb-6 grid gap-4 rounded-2xl border bg-card p-4 shadow-paper sm:grid-cols-3">
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
          <section className="mb-6 space-y-3 rounded-2xl border bg-card p-4 shadow-paper">
            <h2 className="text-sm font-semibold">{t("signPreview")}</h2>
            <img
              src={signature.data}
              alt={t("signPreview")}
              className="block h-auto max-h-[min(65dvh,36rem)] w-full rounded-lg border bg-white object-contain p-2"
            />
            <div className="flex flex-wrap items-center gap-2">
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
                onClick={() => (mode === "draw" ? clearDrawing() : setSignature(null))}
              >
                {t("remove")}
              </Button>
            </div>
          </section>
        )}

        {pinned.length > 0 && (
          <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 text-xs">
            <span>
              {t("pinnedOverlays")}: <strong>{pinned.length}</strong>
            </span>
            <Button variant="ghost" size="sm" onClick={() => setPinned([])}>
              {t("clearPinned")}
            </Button>
          </section>
        )}

        {vault.length > 0 && (
          <section className="mb-6 rounded-2xl border bg-card p-4 shadow-paper">
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
              {t("savedSignatures")}
            </h3>
            <div className="flex flex-wrap gap-3">
              {vault.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMode("image");
                      setSignature(item.image);
                    }}
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
          <section className="rounded-2xl border bg-card p-5 shadow-paper">
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
                <span className="text-sm font-mono">
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
              <div className="min-w-64 max-w-md flex-1">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("watermarkLabel")}
                </label>
                <input
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  placeholder={t("watermarkPlaceholder")}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
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
            <div className="rounded-lg bg-stage p-2">
              <div
                className="relative mx-auto w-fit max-w-full overflow-hidden rounded bg-white"
                style={{ aspectRatio: `${pageSize.width} / ${pageSize.height}` }}
              >
                <canvas
                  ref={previewRef}
                  aria-label={t("signPdf")}
                  className={`block h-auto max-w-full rounded ${preview !== "ready" ? "invisible" : ""}`}
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
                    className="absolute cursor-move touch-none border-2 border-dashed border-primary"
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
                  className="min-w-0 flex-1 accent-primary"
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
                  className="min-w-0 flex-1 accent-primary"
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
