import {
  Camera,
  Check,
  ImagePlus,
  Minus,
  X,
  SwitchCamera,
  Zap,
  ZapOff,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import {
  detectDocument,
  FULL_CORNERS,
  isConvexQuad,
  loadImageCanvas,
  warpPerspective,
  type Corners,
} from "@/lib/imaging";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import {
  batchApproved,
  cameraControls,
  portraitCamera,
  releaseCameraOrientation,
  setCameraControl,
} from "@/lib/camera";

/** In-app camera capture with a review queue for multi-page scanning. */
export function ImagePickers({
  onFiles,
  disabled,
  size = "lg",
}: {
  onFiles: (files: File[]) => void;
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
  const [controlBusy, setControlBusy] = useState(false);
  const [controlError, setControlError] = useState("");
  const [approved, setApproved] = useState<Set<File>>(new Set());
  const lib = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const captureRevision = useRef(0);
  const [capturing, setCapturing] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [captured, setCaptured] = useState<File[]>([]);
  const [captureMode, setCaptureMode] = useState<"single" | "multi">("multi");
  const [liveCorners, setLiveCorners] = useState<Corners | null>(null);
  const [reviewFile, setReviewFile] = useState<File | null>(null);
  const [reviewCorners, setReviewCorners] = useState<Corners>(FULL_CORNERS);
  const [activeCorner, setActiveCorner] = useState<number | null>(null);
  const [reviewImageSize, setReviewImageSize] = useState({ width: 0, height: 0 });
  const reviewUrl = useMemo(
    () => (reviewFile ? URL.createObjectURL(reviewFile) : null),
    [reviewFile],
  );
  useEffect(
    () => () => {
      if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    },
    [reviewUrl],
  );
  const previews = useMemo(
    () => captured.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [captured],
  );

  useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews]);

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
            width: { ideal: 1280 },
            height: { ideal: 1920 },
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
              sample.height = Math.round((240 * source.videoHeight) / source.videoWidth);
              const context = sample.getContext("2d");
              if (!context) return;
              context.drawImage(source, 0, 0, sample.width, sample.height);
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
    setReviewCorners(FULL_CORNERS);
    setReviewImageSize({ width: 0, height: 0 });
    setCameraError("");
    setActiveCorner(null);
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
    setActiveCorner(null);
  };

  const capture = () => {
    if (capturing || reviewFile || !cameraReady) return;
    const element = video.current;
    if (!element || !element.videoWidth || !element.videoHeight) return;
    const revision = ++captureRevision.current;
    setCapturing(true);
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 2400 / Math.max(element.videoWidth, element.videoHeight));
    canvas.width = Math.round(element.videoWidth * scale);
    canvas.height = Math.round(element.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      setCapturing(false);
      setCameraError(t("captureFailed"));
      return;
    }
    context.drawImage(element, 0, 0, canvas.width, canvas.height);
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
        if (captureMode === "single") {
          setReviewFile(file);
          setReviewImageSize({ width: canvas.width, height: canvas.height });
          setReviewCorners(liveCorners ?? FULL_CORNERS);
        }
      },
      "image/jpeg",
      0.94,
    );
  };

  const acceptReview = async () => {
    if (!reviewFile || reviewBusy) return;
    if (!isConvexQuad(reviewCorners)) {
      setCameraError(t("detectFailed"));
      return;
    }
    const revision = captureRevision.current;
    setReviewBusy(true);
    try {
      const source = await loadImageCanvas(reviewFile, 3000);
      const cropped = warpPerspective(source, reviewCorners, 3000);
      const blob = await new Promise<Blob>((resolve, reject) =>
        cropped.toBlob(
          (value) => (value ? resolve(value) : reject(new Error("CROP_FAILED"))),
          "image/jpeg",
          0.95,
        ),
      );
      const file = new File([blob], reviewFile.name, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
      if (revision !== captureRevision.current) return;
      const nextFiles = captured.map((item) => (item === reviewFile ? file : item));
      const nextApproved = new Set(approved);
      nextApproved.delete(reviewFile);
      nextApproved.add(file);
      setCaptured(nextFiles);
      setApproved(nextApproved);
      const next = nextFiles.find((item) => !nextApproved.has(item));
      beginReview(next ?? file);
    } catch {
      setCameraError(t("captureFailed"));
    } finally {
      setReviewBusy(false);
    }
  };

  const acceptCaptured = () => {
    if (!batchApproved(captured, approved) || reviewBusy) return;
    const files = [...captured];
    setCameraOpen(false);
    setCaptured([]);
    setApproved(new Set());
    setReviewFile(null);
    onFiles(files);
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
          <div className="camera-portrait-stage relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-stage">
            <video
              ref={video}
              autoPlay
              muted
              playsInline
              className={`absolute inset-0 h-full w-full object-contain ${reviewFile ? "invisible" : ""}`}
            />
            {reviewFile && reviewUrl ? (
              <div className="relative flex h-full w-full items-center justify-center p-4">
                <img
                  src={reviewUrl}
                  alt={t("page")}
                  className="max-h-full max-w-full object-contain"
                  draggable={false}
                  onLoad={(e) =>
                    setReviewImageSize({
                      width: e.currentTarget.naturalWidth,
                      height: e.currentTarget.naturalHeight,
                    })
                  }
                />
                {reviewImageSize.width > 0 && reviewImageSize.height > 0 && (
                  <svg
                    className="absolute inset-4 h-[calc(100%-2rem)] w-[calc(100%-2rem)] touch-none"
                    viewBox={`0 0 ${reviewImageSize.width} ${reviewImageSize.height}`}
                    preserveAspectRatio="xMidYMid meet"
                    onPointerMove={(e) => {
                      if (activeCorner === null) return;
                      const r = e.currentTarget.getBoundingClientRect();
                      const scale = Math.min(
                        r.width / reviewImageSize.width,
                        r.height / reviewImageSize.height,
                      );
                      const renderedWidth = reviewImageSize.width * scale;
                      const renderedHeight = reviewImageSize.height * scale;
                      const offsetX = (r.width - renderedWidth) / 2;
                      const offsetY = (r.height - renderedHeight) / 2;
                      const x = Math.max(
                        0,
                        Math.min(1, (e.clientX - r.left - offsetX) / renderedWidth),
                      );
                      const y = Math.max(
                        0,
                        Math.min(1, (e.clientY - r.top - offsetY) / renderedHeight),
                      );
                      setReviewCorners(
                        (old) => old.map((p, i) => (i === activeCorner ? { x, y } : p)) as Corners,
                      );
                    }}
                    onPointerUp={() => setActiveCorner(null)}
                    onPointerCancel={() => setActiveCorner(null)}
                  >
                    <polygon
                      className="camera-quad"
                      points={reviewCorners
                        .map(
                          (p) => `${p.x * reviewImageSize.width},${p.y * reviewImageSize.height}`,
                        )
                        .join(" ")}
                      strokeWidth={Math.max(
                        2,
                        Math.min(reviewImageSize.width, reviewImageSize.height) * 0.004,
                      )}
                      vectorEffect="non-scaling-stroke"
                    />
                    {reviewCorners.map((p, i) => (
                      <circle
                        className="camera-corner"
                        key={i}
                        cx={p.x * reviewImageSize.width}
                        cy={p.y * reviewImageSize.height}
                        r={Math.max(
                          12,
                          Math.min(reviewImageSize.width, reviewImageSize.height) * 0.025,
                        )}
                        strokeWidth={Math.max(
                          2,
                          Math.min(reviewImageSize.width, reviewImageSize.height) * 0.003,
                        )}
                        onPointerDown={(e) => {
                          e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
                          setActiveCorner(i);
                        }}
                      />
                    ))}
                  </svg>
                )}
              </div>
            ) : (
              <>
                {liveCorners && (
                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    viewBox={`0 0 ${video.current?.videoWidth || 1} ${video.current?.videoHeight || 1}`}
                    preserveAspectRatio="xMidYMid meet"
                    aria-label={t("livePageEdges")}
                  >
                    <polygon
                      points={liveCorners
                        .map(
                          (p) =>
                            `${p.x * (video.current?.videoWidth || 1)},${p.y * (video.current?.videoHeight || 1)}`,
                        )
                        .join(" ")}
                      className="camera-quad"
                      strokeWidth="3"
                      vectorEffect="non-scaling-stroke"
                    />
                    {liveCorners.map((p, i) => (
                      <circle
                        key={i}
                        cx={p.x * (video.current?.videoWidth || 1)}
                        cy={p.y * (video.current?.videoHeight || 1)}
                        r="7"
                        className="camera-corner"
                      />
                    ))}
                  </svg>
                )}
                {(cameraError || controlError) && (
                  <div
                    className="absolute inset-x-5 top-5 rounded-lg bg-destructive p-4 text-sm text-destructive-foreground"
                    role="alert"
                  >
                    {cameraError || controlError}
                  </div>
                )}
                {!cameraError && !cameraReady && (
                  <p className="absolute bottom-5 rounded-full bg-stage/60 px-4 py-2 text-sm">
                    {t("cameraStarting")}
                  </p>
                )}
              </>
            )}
          </div>

          {reviewFile && (
            <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-stage-foreground/15 p-3">
              <Button
                className="camera-tool"
                variant="ghost"
                size="icon"
                aria-label={t("previous")}
                disabled={reviewBusy || captured.indexOf(reviewFile) <= 0}
                onClick={() => {
                  const file = captured[captured.indexOf(reviewFile) - 1];
                  if (file) beginReview(file);
                }}
              >
                <ChevronLeft />
              </Button>
              <span className="text-sm" dir="ltr">
                {captured.indexOf(reviewFile) + 1} / {captured.length}
              </span>
              <Button
                className="camera-tool"
                variant="ghost"
                size="icon"
                aria-label={t("next")}
                disabled={reviewBusy || captured.indexOf(reviewFile) >= captured.length - 1}
                onClick={() => {
                  const file = captured[captured.indexOf(reviewFile) + 1];
                  if (file) beginReview(file);
                }}
              >
                <ChevronRight />
              </Button>
              <Button
                disabled={reviewBusy || approved.has(reviewFile)}
                onClick={() => void acceptReview()}
              >
                {reviewBusy ? <Loader2 className="animate-spin" /> : <Check />}
                {t(approved.has(reviewFile) ? "approvedPage" : "approvePage")}
              </Button>
              {cameraError && (
                <p role="alert" className="w-full text-center text-destructive-foreground">
                  {cameraError}
                </p>
              )}
            </div>
          )}
          {previews.length > 0 && (
            <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-stage-foreground/15 px-3 py-2">
              {previews.map(({ file, url }, index) => (
                <div key={file.name} className="relative h-16 w-12 shrink-0">
                  <Button
                    variant="ghost"
                    disabled={reviewBusy || capturing}
                    onClick={() => beginReview(file)}
                    aria-label={`${t("page")} ${index + 1}`}
                    className={`h-full w-full overflow-hidden rounded-md p-0 ${reviewFile === file ? "ring-2 ring-primary" : ""}`}
                  >
                    <img
                      src={url}
                      alt={`${t("page")} ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </Button>
                  {approved.has(file) && (
                    <Check className="pointer-events-none absolute bottom-0 start-0 size-5 rounded-full bg-success text-primary-foreground" />
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={reviewBusy || capturing}
                    aria-label={`${t("removeCaptured")} ${index + 1}`}
                    onClick={() => {
                      const remaining = captured.filter((item) => item !== file);
                      setCaptured(remaining);
                      setApproved((old) => {
                        const next = new Set(old);
                        next.delete(file);
                        return next;
                      });
                      if (reviewFile === file) {
                        const next = remaining[Math.min(index, remaining.length - 1)];
                        if (next) beginReview(next);
                        else setReviewFile(null);
                      }
                    }}
                    className="absolute -end-1 -top-1 size-6 rounded-full bg-stage text-stage-foreground"
                  >
                    <Minus className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <footer className="shrink-0 border-t border-stage-foreground/15 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {reviewFile ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="ghost"
                  className="camera-tool"
                  disabled={reviewBusy}
                  onClick={() => {
                    setReviewFile(null);
                    setCameraError("");
                  }}
                >
                  <Camera />
                  {t("resumeCapture")}
                </Button>
                <Button
                  disabled={!batchApproved(captured, approved) || reviewBusy}
                  onClick={acceptCaptured}
                >
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
                    className="camera-tool h-auto min-h-12 whitespace-normal"
                    onClick={() => {
                      const file = captured.find((item) => !approved.has(item)) ?? captured[0];
                      if (file) beginReview(file);
                    }}
                    disabled={!captured.length || capturing}
                  >
                    <Check />
                    {t("cameraReview")}
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
        </div>
      )}
    </>
  );
}
