import { Camera, Check, ImagePlus, Minus, X } from "lucide-react";
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
      try {
        (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.();
      } catch {
        /* ignored */
      }
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
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 2560 },
          },
        });
        if (!active) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = media;
        try {
          const { StatusBar } = await import("@capacitor/status-bar");
          await StatusBar.setOverlaysWebView({ overlay: false });
          await StatusBar.show();
        } catch {
          /* Browser preview has no native status bar. */
        }
        try {
          const orientation = screen.orientation as ScreenOrientation & { unlock?: () => void };
          await orientation.lock("landscape");
        } catch {
          /* Orientation lock is best-effort; CSS still provides a landscape camera stage. */
        }
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play();
          setCameraReady(true);
          detectTimer = setInterval(async () => {
            const source = video.current;
            if (!source || source.readyState < 2 || !source.videoWidth) return;
            try {
              const sample = document.createElement("canvas");
              sample.width = 320;
              sample.height = Math.round((320 * source.videoHeight) / source.videoWidth);
              const context = sample.getContext("2d");
              if (!context) return;
              context.drawImage(source, 0, 0, sample.width, sample.height);
              const result = detectDocument(sample);
              setLiveCorners(result.detected ? result.corners : null);
            } catch {
              setLiveCorners(null);
            }
          }, 550);
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
      try {
        (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.();
      } catch {
        /* ignored */
      }
    };
  }, [cameraOpen, t]);

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
    setCameraError("");
    setReviewFile(null);
    setActiveCorner(null);
  };

  const capture = () => {
    if (capturing) return;
    const element = video.current;
    if (!element || !element.videoWidth || !element.videoHeight) return;
    const revision = ++captureRevision.current;
    setCapturing(true);
    const canvas = document.createElement("canvas");
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
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
        setReviewFile(file);
        setReviewImageSize({ width: canvas.width, height: canvas.height });
        setReviewCorners(liveCorners ?? FULL_CORNERS);
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
      setReviewFile(null);
      setReviewImageSize({ width: 0, height: 0 });
      setActiveCorner(null);
      if (captureMode === "single") {
        setCameraOpen(false);
        onFiles([file]);
      } else {
        setCaptured((current) => [...current, file]);
      }
    } catch {
      setCameraError(t("captureFailed"));
    } finally {
      setReviewBusy(false);
    }
  };

  const acceptCaptured = () => {
    if (!captured.length) return;
    const files = [...captured];
    setCameraOpen(false);
    setCaptured([]);
    onFiles(files);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size={size} disabled={disabled} onClick={() => setCameraOpen(true)}>
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

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-stage camera-landscape-stage">
            <video
              ref={video}
              autoPlay
              muted
              playsInline
              className={`h-full w-full object-contain ${reviewFile ? "hidden" : ""}`}
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
                {cameraError && (
                  <div
                    className="absolute inset-x-5 top-5 rounded-lg bg-destructive p-4 text-sm text-destructive-foreground"
                    role="alert"
                  >
                    {cameraError}
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

          {reviewFile ? (
            <footer className="flex items-center justify-center gap-3 border-t border-stage-foreground/15 p-4">
              <Button
                variant="outline"
                onClick={() => {
                  setReviewFile(null);
                  setReviewImageSize({ width: 0, height: 0 });
                  setActiveCorner(null);
                }}
              >
                {t("cancel")}
              </Button>
              <Button disabled={reviewBusy} onClick={() => void acceptReview()}>
                <Check /> {reviewBusy ? t("processing") : t("useCaptured")}
              </Button>
            </footer>
          ) : null}

          {previews.length > 0 && (
            <div className="flex gap-2 overflow-x-auto border-t border-stage-foreground/15 px-3 py-2">
              {previews.map(({ file, url }, index) => (
                <div
                  key={file.name}
                  className="relative h-20 w-16 shrink-0 overflow-hidden rounded-md border border-stage-foreground/30"
                >
                  <img
                    src={url}
                    alt={`${t("page")} ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    type="button"
                    aria-label={t("removeCaptured")}
                    onClick={() => setCaptured((items) => items.filter((_, i) => i !== index))}
                    className="absolute end-1 top-1 grid size-6 place-items-center rounded-full bg-stage/75 text-stage-foreground"
                  >
                    <Minus className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <footer className="flex flex-wrap items-center justify-center gap-3 border-t border-stage-foreground/15 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div
              className="flex rounded-md border border-stage-foreground/25 p-1"
              role="group"
              aria-label={t("captureMode")}
            >
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCaptureMode("single")}
                aria-pressed={captureMode === "single"}
                className={
                  captureMode === "single"
                    ? "bg-stage-foreground text-stage"
                    : "text-stage-foreground"
                }
              >
                {t("singleShot")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCaptureMode("multi")}
                aria-pressed={captureMode === "multi"}
                className={
                  captureMode === "multi"
                    ? "bg-stage-foreground text-stage"
                    : "text-stage-foreground"
                }
              >
                {t("multiShot")}
              </Button>
            </div>
            <Button
              variant="outline"
              className="border-stage-foreground/30 bg-transparent text-stage-foreground hover:bg-stage-foreground/10 hover:text-stage-foreground"
              onClick={closeCamera}
            >
              {t("cancel")}
            </Button>
            <Button
              className="rounded-full"
              onClick={capture}
              disabled={capturing || !!cameraError || !cameraReady || !!reviewFile}
            >
              <Camera /> {t("capturePage")}
            </Button>
            <Button
              onClick={acceptCaptured}
              disabled={!captured.length || captureMode === "single" || !!reviewFile}
            >
              <Check /> {t("useCaptured")} ({captured.length})
            </Button>
          </footer>
        </div>
      )}
    </>
  );
}
