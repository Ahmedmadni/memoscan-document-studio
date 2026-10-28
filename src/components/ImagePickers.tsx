import { Camera, Check, ImagePlus, Minus, X } from "lucide-react";
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
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [captured, setCaptured] = useState<File[]>([]);
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
      return;
    }
    let active = true;
    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("CAMERA_UNAVAILABLE");
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 2560 } },
        });
        if (!active) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = media;
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play();
          setCameraReady(true);
        }
      } catch {
        if (active) setCameraError(t("cameraUnavailable"));
      }
    };
    setCameraError("");
    void startCamera();
    return () => {
      active = false;
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      setCameraReady(false);
    };
  }, [cameraOpen, t]);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) onFiles(files);
  };

  const closeCamera = () => {
    setCameraOpen(false);
    setCaptured([]);
    setCameraError("");
  };

  const capture = () => {
    const element = video.current;
    if (!element || !element.videoWidth || !element.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(element, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError(t("captureFailed"));
        return;
      }
      const file = new File([blob], `memoscan-${Date.now()}-${captured.length + 1}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
      setCaptured((current) => [...current, file]);
    }, "image/jpeg", 0.94);
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
        <Button size={size} variant="outline" disabled={disabled} onClick={() => lib.current?.click()}>
          <ImagePlus /> {t("importImages")}
        </Button>
        <input ref={lib} type="file" accept="image/*" multiple hidden onChange={handleImport} />
      </div>

      {cameraOpen && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={t("scanCamera")}>
          <header className="flex items-center justify-between gap-3 border-b border-white/15 px-4 py-3">
            <div>
              <p className="font-semibold">{t("scanCamera")}</p>
              <p className="text-sm text-white/70">{t("capturedPages")}: {captured.length}</p>
            </div>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/15 hover:text-white" onClick={closeCamera} aria-label={t("cancel")}>
              <X />
            </Button>
          </header>

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
            <video ref={video} autoPlay muted playsInline className="h-full w-full object-contain" />
            {cameraError && (
              <div className="absolute inset-x-5 top-5 rounded-xl bg-red-950/90 p-4 text-sm" role="alert">{cameraError}</div>
            )}
            {!cameraError && !stream.current && (
              <p className="absolute bottom-5 rounded-full bg-black/60 px-4 py-2 text-sm">{t("cameraStarting")}</p>
            )}
          </div>

          {previews.length > 0 && (
            <div className="flex gap-2 overflow-x-auto border-t border-white/15 px-3 py-2">
              {previews.map(({ file, url }, index) => (
                <div key={file.name} className="relative h-20 w-16 shrink-0 overflow-hidden rounded-md border border-white/30">
                  <img src={url} alt={`${t("page")} ${index + 1}`} className="h-full w-full object-cover" />
                  <button type="button" aria-label={t("removeCaptured")} onClick={() => setCaptured((items) => items.filter((_, i) => i !== index))} className="absolute end-1 top-1 grid size-6 place-items-center rounded-full bg-black/75">
                    <Minus className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <footer className="flex flex-wrap items-center justify-center gap-3 border-t border-white/15 px-4 py-4">
            <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={closeCamera}>{t("cancel")}</Button>
            <Button className="rounded-full" onClick={capture} disabled={!!cameraError || !cameraReady}>
              <Camera /> {t("capturePage")}
            </Button>
            <Button onClick={acceptCaptured} disabled={!captured.length}>
              <Check /> {t("useCaptured")} ({captured.length})
            </Button>
          </footer>
        </div>
      )}
    </>
  );
}
