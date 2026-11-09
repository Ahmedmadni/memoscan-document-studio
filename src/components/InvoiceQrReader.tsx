import { Camera, ImagePlus, QrCode } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n, type TKey } from "@/lib/i18n";
import { loadImageCanvas } from "@/lib/imaging";
import { decodeZatcaTlvBase64, type ZatcaInvoiceData } from "@/lib/zatca";

const FIELDS: [keyof ZatcaInvoiceData, TKey][] = [
  ["sellerName", "invoiceSeller"],
  ["vatNumber", "invoiceVatNumber"],
  ["timestamp", "invoiceTimestamp"],
  ["totalWithVat", "invoiceTotal"],
  ["vatAmount", "invoiceVatAmount"],
];

const VALIDATION_URL =
  "https://zatca.gov.sa/ar/eServices/Pages/VerifytheValidityofthee-invoice.aspx";

export function InvoiceQrReader({
  onSave,
}: {
  onSave?: (invoice: ZatcaInvoiceData) => Promise<void>;
}) {
  const { t } = useI18n();
  const [raw, setRaw] = useState("");
  const [invoice, setInvoice] = useState<ZatcaInvoiceData | null>(null);
  const [error, setError] = useState<TKey | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);

  function inspect(payload: string) {
    const decoded = decodeZatcaTlvBase64(payload);
    setInvoice(decoded);
    setError(decoded ? null : "zatcaInvalid");
    setSaved(false);
  }

  useEffect(() => {
    if (!scanning) return;
    let active = true;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function scan() {
      try {
        const { default: readQr } = await import("jsqr");
        if (!active) return;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const source = video.current;
        if (!source) throw new Error("QR_VIDEO_UNAVAILABLE");
        source.srcObject = stream;
        await source.play();
        if (!active) return;

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("QR_CANVAS_UNAVAILABLE");
        timer = setInterval(() => {
          if (source.readyState < 2 || !source.videoWidth || !source.videoHeight) return;
          try {
            const scale = Math.min(1, 900 / Math.max(source.videoWidth, source.videoHeight));
            canvas.width = Math.max(1, Math.round(source.videoWidth * scale));
            canvas.height = Math.max(1, Math.round(source.videoHeight * scale));
            ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
            const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result = readQr(frame.data, frame.width, frame.height);
            if (result) {
              clearInterval(timer);
              inspect(result.data);
              setScanning(false);
            }
          } catch {
            clearInterval(timer);
            setError("invoiceQrUnreadable");
            setScanning(false);
          }
        }, 300);
      } catch {
        if (active) {
          setError("cameraUnavailable");
          setScanning(false);
        }
      }
    }

    void scan();
    return () => {
      active = false;
      clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [scanning]);

  async function readImage(file: File) {
    setBusy(true);
    setError(null);
    setInvoice(null);
    try {
      const [{ default: readQr }, canvas] = await Promise.all([
        import("jsqr"),
        loadImageCanvas(file, 1800),
      ]);
      const frame = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height);
      const result = frame && readQr(frame.data, frame.width, frame.height);
      if (result) inspect(result.data);
      else setError("invoiceQrUnreadable");
    } catch {
      setError("invoiceQrUnreadable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy}
          onClick={() => {
            if (!scanning) {
              setInvoice(null);
              setError(null);
            }
            setScanning(!scanning);
          }}
        >
          <Camera /> {t(scanning ? "invoiceStopScan" : "invoiceScan")}
        </Button>
        <Button
          variant="outline"
          disabled={scanning || busy}
          onClick={() => input.current?.click()}
        >
          <ImagePlus /> {t("invoiceImage")}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void readImage(file);
          }}
        />
      </div>
      {scanning && (
        <div className="space-y-2">
          <p role="status" className="text-sm">
            {t("invoiceScanHint")}
          </p>
          <video
            ref={video}
            autoPlay
            muted
            playsInline
            className="max-h-80 w-full rounded-lg bg-stage object-contain"
          />
        </div>
      )}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (raw.trim() && !scanning && !busy) inspect(raw);
        }}
      >
        <input
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          aria-label={t("invoiceQrText")}
          placeholder={t("zatcaPlaceholder")}
          dir="ltr"
          disabled={scanning || busy}
          className="h-9 min-w-40 flex-1 rounded-md border bg-background px-3 text-sm"
        />
        <Button variant="secondary" type="submit" disabled={!raw.trim() || scanning || busy}>
          <QrCode /> {t("zatcaDecodeBtn")}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
      {invoice && (
        <div className="space-y-3 rounded-lg border bg-background p-4">
          <p role="status" className="font-medium text-success">
            {t("zatcaSuccess")}
          </p>
          <dl className="space-y-2 text-sm">
            {FIELDS.map(([key, label]) => (
              <div key={key} className="grid gap-1 border-b pb-2 sm:grid-cols-2">
                <dt className="font-medium">{t(label)}</dt>
                <dd
                  dir={key === "sellerName" ? "auto" : "ltr"}
                  className="break-all text-start tabular-nums"
                >
                  {invoice[key]}
                </dd>
              </div>
            ))}
          </dl>
          {onSave && (
            <Button
              variant="outline"
              disabled={busy || saved}
              onClick={async () => {
                setBusy(true);
                try {
                  await onSave(invoice);
                  setSaved(true);
                  toast.success(t("saved"));
                } catch {
                  toast.error(t("errGeneric"));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t(saved ? "saved" : "invoiceSaveNotes")}
            </Button>
          )}
        </div>
      )}
      <p className="text-sm text-muted-foreground">{t("invoiceValidationLimit")}</p>
      <a
        href={VALIDATION_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-sm font-medium text-primary underline"
      >
        {t("invoiceOfficialCheck")}
      </a>
    </section>
  );
}
