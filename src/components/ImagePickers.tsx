import {
  Camera,
  Check,
  Grid3X3,
  ImagePlus,
  Minus,
  X,
  SwitchCamera,
  Zap,
  ZapOff,
  Loader2,
  Images,
  SlidersHorizontal,
} from "lucide-react";
import {
  detectDocument,
  FULL_CORNERS,
  loadImageCanvas,
  processPage,
  defaultSettings,
  type EditSettings,
  type Corners,
} from "@/lib/imaging";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageEditor } from "@/components/PageEditor";
import { useI18n } from "@/lib/i18n";
import {
  batchApproved,
  cameraControls,
  portraitCamera,
  portraitFrame,
  releaseCameraOrientation,
  setCameraControl,
} from "@/lib/camera";

/** In-app camera capture with a review queue for multi-page scanning. */
export function ImagePickers({
  onFiles,
  disabled,
  size = "lg",
}: {
  onFiles: (files: File[], edits?: ReadonlyMap<File, EditSettings>) => void;
  disabled?: boolean;
  size?: "default" | "lg";
}) {
  const { t } = useI18n();
  const system = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [controls, setControls] = useState<ReturnType<typeof cameraControls>>({
    torch: false,
    zoom: null,
  });
  const [torch, setTorch] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [controlBusy, setControlBusy] = useState(false);
  const [controlError, setControlError] = useState("");
  const [approved, setApproved] = useState<Set<File>>(new Set());
  const lib = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const captureRevision = useRef(0);
  const [capturing, setCapturing] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [captured, setCaptured] = useState<File[]>([]);
  const [captureMode, setCaptureMode] = useState<"single" | "multi">("multi");
  const [liveCorners, setLiveCorners] = useState<Corners | null>(null);
  const [reviewFile, setReviewFile] = useState<File | null>(null);
  const [editingReview, setEditingReview] = useState(false);
  const [reviewSettings, setReviewSettings] = useState<Map<File, EditSettings>>(new Map());
  const [reviewPreview, setReviewPreview] = useState<{
    file: File;
    settings: EditSettings;
    url: string;
  } | null>(null);
  const selectedSettings = reviewFile ? reviewSettings.get(reviewFile) : undefined;
  const selectedPreview =
    reviewPreview?.file === reviewFile && reviewPreview.settings === selectedSettings
      ? reviewPreview.url
      : null;
  useEffect(() => {
    if (!reviewFile || !selectedSettings) return;
    let active = true;
    void loadImageCanvas(reviewFile, 1000)
      .then((source) => {
        if (!active) return;
        const url = processPage(source, selectedSettings, 1000).toDataURL("image/jpeg", 0.9);
        setReviewPreview({ file: reviewFile, settings: selectedSettings, url });
      })
      .catch(() => {
        if (active) setCameraError(t("captureFailed"));
      });
    return () => {
      active = false;
    };
  }, [reviewFile, selectedSettings, t]);
  useEffect(() => {
    if (!cameraOpen) {
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      setCameraReady(false);
      setLiveCorners(null);
      void releaseCameraOrientation().catch(() => {});
      return;
    }
    let active = true;
    let detectTimer: ReturnType<typeof setInterval> | undefined;
    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("CAMERA_UNAVAILABLE");
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 2560 },
            aspectRatio: { ideal: 3 / 4 },
          },
        });
        if (!active) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = media;
        void portraitCamera().catch(() => {});
        const track = media.getVideoTracks?.()[0];
        setControls(track ? cameraControls(track) : { torch: false, zoom: null });
        setTorch(false);
        setZoom(
          (track?.getSettings?.() as (MediaTrackSettings & { zoom?: number }) | undefined)?.zoom ??
            1,
        );
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play();
          if (!active) return;
          setCameraReady(true);
          detectTimer = setInterval(async () => {
            const source = video.current;
            if (!source || source.readyState < 2 || !source.videoWidth) return;
            try {
              const sample = document.createElement("canvas");
              sample.width = 240;
              sample.height = 320;
              const context = sample.getContext("2d");
              if (!context) return;
              const frame = portraitFrame(source.videoWidth, source.videoHeight);
              context.drawImage(
                source,
                frame.x,
                frame.y,
                frame.width,
                frame.height,
                0,
                0,
                sample.width,
                sample.height,
              );
              const result = detectDocument(sample);
              setLiveCorners(result.detected ? result.corners : null);
            } catch {
              setLiveCorners(null);
            }
          }, 800);
        }
      } catch {
        if (active) setCameraError(t("cameraUnavailable"));
      }
    };
    setCameraError("");
    void startCamera();
    return () => {
      active = false;
      captureRevision.current += 1;
      if (detectTimer) clearInterval(detectTimer);
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      setCameraReady(false);
      setLiveCorners(null);
      void releaseCameraOrientation().catch(() => {});
    };
  }, [cameraOpen, facing, t]);

  const changeControl = async (key: "torch" | "zoom", value: boolean | number) => {
    const track = stream.current?.getVideoTracks?.()[0];
    if (!track || controlBusy) return;
    setControlBusy(true);
    setControlError("");
    try {
      await setCameraControl(track, key, value);
      if (track !== stream.current?.getVideoTracks?.()[0]) return;
      if (key === "torch") setTorch(Boolean(value));
      else setZoom(Number(value));
    } catch {
      setControlError(t("cameraControlFailed"));
    } finally {
      setControlBusy(false);
    }
  };

  const beginReview = (file: File) => {
    setReviewFile(file);
    setCameraError("");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) onFiles(files);
  };

  const closeCamera = () => {
    captureRevision.current += 1;
    setCapturing(false);
    setCameraOpen(false);
    setCaptured([]);
    setApproved(new Set());
    setControlError("");
    setCameraError("");
    setReviewFile(null);
    setEditingReview(false);
    setReviewSettings(new Map());
    setReviewPreview(null);
  };

  const capture = () => {
    if (capturing || reviewFile || !cameraReady) return;
    const element = video.current;
    if (!element || !element.videoWidth || !element.videoHeight) return;
    const revision = ++captureRevision.current;
    setCapturing(true);
    const canvas = document.createElement("canvas");
    const frame = portraitFrame(element.videoWidth, element.videoHeight);
    const scale = Math.min(1, 2400 / frame.height);
    canvas.width = Math.round(frame.width * scale);
    canvas.height = Math.round(frame.height * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      setCapturing(false);
      setCameraError(t("captureFailed"));
      return;
    }
    context.drawImage(
      element,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    let corners = liveCorners ?? FULL_CORNERS;
    try {
      const result = detectDocument(canvas);
      if (result.detected) corners = result.corners;
    } catch {
      // Keep the latest live outline when still-frame detection is unavailable.
    }
    canvas.toBlob(
      (blob) => {
        if (revision !== captureRevision.current) return;
        setCapturing(false);
        if (!blob) {
          setCameraError(t("captureFailed"));
          return;
        }
        const file = new File([blob], `memoscan-${Date.now()}-${captured.length + 1}.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
        setCaptured((current) => [...current, file]);
        setReviewSettings((old) =>
          new Map(old).set(file, { ...defaultSettings(corners), filter: "original", sharpen: 0 }),
        );
        if (captureMode === "single") beginReview(file);
      },
      "image/jpeg",
      0.94,
    );
  };

  const acceptReview = () => {
    if (!reviewFile) return;
    const nextApproved = new Set(approved).add(reviewFile);
    setApproved(nextApproved);
    const next = captured.find((file) => !nextApproved.has(file));
    if (next) beginReview(next);
  };

  const acceptCaptured = () => {
    if (!batchApproved(captured, approved)) return;
    const files = [...captured];
    setCameraOpen(false);
    setCaptured([]);
    setApproved(new Set());
    setReviewFile(null);
    setReviewSettings(new Map());
    setReviewPreview(null);
    onFiles(files, reviewSettings);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          size={size}
          className="min-h-14 gap-3 px-7 shadow-paper"
          disabled={disabled}
          onClick={() => setCameraOpen(true)}
        >
          <Camera /> {t("scanCamera")}
        </Button>
        <Button
          size={size}
          variant="outline"
          disabled={disabled}
          onClick={() => lib.current?.click()}
        >
          <ImagePlus /> {t("importImages")}
        </Button>
        <input
          ref={system}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={handleImport}
        />
        <input ref={lib} type="file" accept="image/*" multiple hidden onChange={handleImport} />
      </div>

      {cameraOpen && (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-stage text-stage-foreground"
          role="dialog"
          aria-modal="true"
          aria-label={t("scanCamera")}
        >
          <header className="flex items-center justify-between gap-3 border-b border-stage-foreground/15 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div>
              <p className="font-semibold">{t("scanCamera")}</p>
              <p className="text-sm text-stage-foreground/70">
                {t("capturedPages")}: {captured.length}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-stage-foreground hover:bg-stage-foreground/15 hover:text-stage-foreground"
              onClick={closeCamera}
              aria-label={t("cancel")}
            >
              <X />
            </Button>
          </header>

          {!reviewFile && (
            <div className="flex shrink-0 items-center justify-center gap-3 px-4 py-2">
              <Button
                size="icon"
                variant="ghost"
                className="camera-tool"
                disabled={!cameraReady || !controls.torch || controlBusy}
                title={t(controls.torch ? (torch ? "torchOff" : "torchOn") : "torchUnavailable")}
                aria-label={t(
                  controls.torch ? (torch ? "torchOff" : "torchOn") : "torchUnavailable",
                )}
                aria-pressed={torch}
                onClick={() => void changeControl("torch", !torch)}
              >
                {torch ? <Zap /> : <ZapOff />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="camera-tool"
                disabled={!cameraReady || capturing || controlBusy}
                title={t("switchCamera")}
                aria-label={t("switchCamera")}
                onClick={() => {
                  setCameraReady(false);
                  setControlError("");
                  setFacing((old) => (old === "environment" ? "user" : "environment"));
                }}
              >
                <SwitchCamera />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="camera-tool"
                title={t("cameraGrid")}
                aria-label={t("cameraGrid")}
                aria-pressed={showGrid}
                onClick={() => setShowGrid((g) => !g)}
              >
                <Grid3X3 />
              </Button>
              {controls.zoom && (
                <label className="flex min-w-0 items-center gap-2 text-xs">
                  {t("cameraZoom")}
                  <input
                    type="range"
                    aria-label={t("cameraZoom")}
                    min={controls.zoom.min}
                    max={controls.zoom.max}
                    step={controls.zoom.step || 0.1}
                    value={zoom}
                    disabled={controlBusy}
                    onChange={(e) => void changeControl("zoom", Number(e.target.value))}
                    className="w-24 accent-primary"
                  />
                  <span dir="ltr">{zoom.toFixed(1)}×</span>
                </label>
              )}
            </div>
          )}
          <div
            className="camera-portrait-stage relative min-h-0 flex-1 overflow-hidden"
            hidden={!!reviewFile}
          >
            <div className="camera-portrait-frame">
              <video ref={video} autoPlay muted playsInline className="size-full object-cover" />
              {showGrid && (
                <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-25">
                  {Array.from({ length: 9 }, (_, i) => (
                    <div
                      key={i}
                      className={`${i % 3 !== 2 ? "border-e" : ""} ${i < 6 ? "border-b" : ""} border-stage-foreground`}
                    />
                  ))}
                </div>
              )}
              {liveCorners && (
                <svg
                  className="pointer-events-none absolute inset-0 size-full"
                  viewBox="0 0 240 320"
                  aria-label={t("livePageEdges")}
                >
                  <polygon
                    points={liveCorners.map((p) => `${p.x * 240},${p.y * 320}`).join(" ")}
                    className="camera-quad"
                    strokeWidth="3"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
            </div>
            {(cameraError || controlError) && (
              <div
                className="absolute inset-x-5 top-5 rounded-lg bg-destructive p-4 text-sm text-destructive-foreground"
                role="alert"
              >
                {cameraError || controlError}
              </div>
            )}
            {!cameraError && !cameraReady && (
              <p className="absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-stage/60 px-4 py-2 text-sm">
                {t("cameraStarting")}
              </p>
            )}
          </div>

          {reviewFile && (
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4 sm:flex-row">
                <div className="flex min-h-40 flex-1 flex-col items-center justify-center gap-2">
                  <p className="text-sm font-medium">
                    {t("selectedPagePreview")} · {captured.indexOf(reviewFile) + 1}
                  </p>
                  {selectedPreview ? (
                    <img
                      src={selectedPreview}
                      alt={t("page")}
                      className="min-h-0 max-h-[50dvh] max-w-full object-contain"
                    />
                  ) : (
                    !cameraError && <p role="status">{t("loading")}</p>
                  )}
                </div>
                <ol
                  className="max-h-32 shrink-0 space-y-1 overflow-y-auto sm:max-h-full sm:w-48"
                  aria-label={t("cameraReview")}
                >
                  {captured.map((file, index) => (
                    <li key={file.name}>
                      <Button
                        variant="ghost"
                        className="camera-tool w-full justify-between data-[selected=true]:bg-stage-foreground/20"
                        aria-pressed={file === reviewFile}
                        data-selected={file === reviewFile}
                        onClick={() => beginReview(file)}
                      >
                        {t("page")} {index + 1}
                        {approved.has(file) && <Check aria-hidden="true" />}
                      </Button>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-stage-foreground/15 p-3">
                <Button
                  variant="ghost"
                  className="camera-tool"
                  aria-label={t("edit")}
                  title={t("edit")}
                  onClick={() => setEditingReview(true)}
                >
                  <SlidersHorizontal />
                  {t("editSelectedPage")}
                </Button>
                <Button
                  variant="ghost"
                  className="camera-tool"
                  size="icon"
                  aria-label={t("removeCaptured")}
                  title={t("removeCaptured")}
                  onClick={() => {
                    const index = captured.indexOf(reviewFile);
                    const remaining = captured.filter((file) => file !== reviewFile);
                    setCaptured(remaining);
                    setApproved((old) => {
                      const next = new Set(old);
                      next.delete(reviewFile);
                      return next;
                    });
                    setReviewSettings((old) => {
                      const next = new Map(old);
                      next.delete(reviewFile);
                      return next;
                    });
                    const next = remaining[Math.min(index, remaining.length - 1)];
                    if (next) beginReview(next);
                    else setReviewFile(null);
                  }}
                >
                  <Minus />
                </Button>
                <Button
                  disabled={approved.has(reviewFile) || !selectedPreview}
                  onClick={acceptReview}
                >
                  <Check />
                  {t(approved.has(reviewFile) ? "approvedPage" : "approvePage")}
                </Button>
                {cameraError && (
                  <p role="alert" className="w-full text-center text-destructive-foreground">
                    {cameraError}
                  </p>
                )}
              </div>
            </>
          )}
          <footer className="shrink-0 border-t border-stage-foreground/15 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {reviewFile ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="ghost"
                  className="camera-tool"
                  onClick={() => {
                    setReviewFile(null);
                    setCameraError("");
                  }}
                >
                  <Camera />
                  {t("resumeCapture")}
                </Button>
                <Button disabled={!batchApproved(captured, approved)} onClick={acceptCaptured}>
                  <Check />
                  {t("finishBatch")} ({approved.size}/{captured.length})
                </Button>
              </div>
            ) : (
              <>
                <div
                  className="mb-3 flex justify-center"
                  role="group"
                  aria-label={t("captureMode")}
                >
                  {(["single", "multi"] as const).map((mode) => (
                    <Button
                      key={mode}
                      size="sm"
                      variant="ghost"
                      disabled={capturing || captured.length > 0}
                      aria-pressed={captureMode === mode}
                      onClick={() => setCaptureMode(mode)}
                      className={
                        captureMode === mode ? "bg-stage-foreground text-stage" : "camera-tool"
                      }
                    >
                      {t(mode === "single" ? "singleShot" : "multiShot")}
                    </Button>
                  ))}
                </div>
                <div className="grid grid-cols-[1fr_80px_1fr] items-center gap-3">
                  <span role="status" className="text-center text-sm">
                    {t("capturedPages")}
                    <br />
                    {captured.length}
                  </span>
                  <Button
                    aria-label={t("capturePage")}
                    className="camera-shutter"
                    onClick={capture}
                    disabled={capturing || !!cameraError || !cameraReady}
                  >
                    {capturing ? (
                      <Loader2 className="size-7 animate-spin" />
                    ) : (
                      <span className="camera-shutter-core" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    className="camera-tool relative mx-auto size-14"
                    size="icon"
                    aria-label={t("cameraReview")}
                    title={t("cameraReview")}
                    onClick={() => {
                      const file = captured.find((item) => !approved.has(item)) ?? captured[0];
                      if (file) beginReview(file);
                    }}
                    disabled={!captured.length || capturing}
                  >
                    <Images className="size-7" />
                    {captured.length > 0 && (
                      <span
                        className="absolute -end-1 -top-1 grid min-w-6 place-items-center rounded-full bg-primary px-1 text-xs leading-6 text-primary-foreground"
                        aria-hidden="true"
                      >
                        {captured.length}
                      </span>
                    )}
                  </Button>
                </div>
                {cameraError && (
                  <Button
                    className="camera-tool mt-2 w-full"
                    variant="ghost"
                    onClick={() => {
                      closeCamera();
                      system.current?.click();
                    }}
                  >
                    <Camera />
                    {t("systemCamera")}
                  </Button>
                )}
              </>
            )}
          </footer>
          {editingReview && reviewFile && (
            <div className="fixed inset-0 z-[80] text-foreground">
              <PageEditor
                key={reviewFile.name}
                page={{
                  id: reviewFile.name,
                  docId: "camera-review",
                  original: reviewFile,
                  processed: reviewFile,
                  thumb: "",
                  width: 0,
                  height: 0,
                  createdAt: reviewFile.lastModified,
                  autoDetected: false,
                  settings: selectedSettings ?? defaultSettings(),
                }}
                onSave={async (settings) => {
                  setReviewSettings((old) => new Map(old).set(reviewFile, settings));
                  setApproved((old) => {
                    const next = new Set(old);
                    next.delete(reviewFile);
                    return next;
                  });
                }}
                onClose={() => setEditingReview(false)}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
